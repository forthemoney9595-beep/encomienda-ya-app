'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, startAfter, getDocs, doc, updateDoc, serverTimestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useCallback } from 'react';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, AlertTriangle, XCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy HH:mm", { locale: es }); } catch { return '—'; }
};

function AdminIncidentsPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [statusTab, setStatusTab] = useState<'pending' | 'resolved'>('pending');
  const [resolving, setResolving] = useState<string | null>(null);

  // A diferencia de payment_mismatches (siempre chica), los incidentes SÍ pueden crecer
  // con el volumen de pedidos -- paginado con getDocs+cursor, mismo patrón que
  // admin/users y admin/reviews (useCollection descarta el snapshot que startAfter necesita).
  const [rows, setRows] = useState<any[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const base = query(collection(firestore, 'driver_incidents'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    return cursor ? query(base, startAfter(cursor)) : base;
  }, [firestore]);

  const resetLoad = useCallback(async () => {
    const q = buildQuery(null);
    if (!q) return;
    setIsLoading(true);
    try {
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastSnap(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { resetLoad(); }, [resetLoad]);

  const loadMore = async () => {
    const q = buildQuery(lastSnap);
    if (!q || !lastSnap) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(q);
      setRows(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastSnap(snap.docs[snap.docs.length - 1] || lastSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Igual que payment_mismatches: los registros viejos no tienen `resolved`, se tratan
  // como pendientes -- filtro en memoria sobre la página ya cargada, no un `where`.
  const displayed = useMemo(
    () => rows.filter(r => (statusTab === 'pending' ? r.resolved !== true : r.resolved === true)),
    [rows, statusTab],
  );

  const handleResolve = async (id: string) => {
    if (!firestore || !user) return;
    setResolving(id);
    try {
      await updateDoc(doc(firestore, 'driver_incidents', id), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: user.uid,
      });
      logAdminAction(firestore, user.uid, 'resolve_driver_incident', id);
      toast({ title: 'Marcado como resuelto' });
      setRows(prev => prev.map(r => r.id === id ? { ...r, resolved: true } : r));
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar.' });
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title="Incidentes de Repartidor"
        description="Pedidos soltados antes de retirar o reportados como problema después de retirar."
      />

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as 'pending' | 'resolved')}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes ({rows.filter(r => r.resolved !== true).length})</TabsTrigger>
          <TabsTrigger value="resolved">Resueltos ({rows.filter(r => r.resolved === true).length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && displayed.length === 0 && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto opacity-30 text-success" />
            <p>{statusTab === 'pending' ? 'Sin incidentes pendientes.' : 'Todavía no resolviste ninguno.'}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && displayed.length > 0 && (
        <div className="space-y-3">
          {displayed.map((inc: any) => (
            <Card key={inc.id} className={cn('border-l-4', inc.type === 'released' ? 'border-l-destructive' : 'border-l-warning')}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px] gap-1',
                      inc.type === 'released' ? 'border-destructive/40 text-destructive' : 'border-warning/40 text-warning'
                    )}>
                      {inc.type === 'released' ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {inc.type === 'released' ? 'Soltó pedido' : 'Reportó problema'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(inc.createdAt)}</span>
                  </div>
                  <p className="text-sm">
                    <strong>{inc.driverName}</strong> — {inc.storeName || 'Tienda desconocida'}
                  </p>
                  <p className="text-xs text-muted-foreground">{inc.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/orders/${inc.orderId}`} target="_blank">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver pedido
                    </Link>
                  </Button>
                  {statusTab === 'pending' && (
                    <Button size="sm" onClick={() => handleResolve(inc.id)} disabled={resolving === inc.id}>
                      {resolving === inc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Marcar resuelto'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminIncidentsPageGuarded() {
  return <AdminAuthGuard><AdminIncidentsPage /></AdminAuthGuard>;
}
