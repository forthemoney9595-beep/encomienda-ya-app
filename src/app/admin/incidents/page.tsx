'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AdminAuthGuard from '../admin-auth-guard';
import { Button } from '@/components/ui/button';
import { AdminPage } from '@/components/admin/admin-page';
import { ListCard, ListRow, SlidingChips } from '@/components/admin/admin-list';
import { EmptyState } from '@/components/admin/empty-state';
import { StatusBadge } from '@/components/admin/status-badge';
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

  const pendingN = rows.filter(r => r.resolved !== true).length;
  const resolvedN = rows.filter(r => r.resolved === true).length;

  return (
    <AdminPage
      title="Incidentes de reparto"
      subtitle="Pedidos soltados antes de retirar o reportados como problema después de retirar."
    >
      <SlidingChips
        chips={[
          { value: 'pending' as const, label: 'Pendientes', count: isLoading ? null : pendingN },
          { value: 'resolved' as const, label: 'Resueltos', count: isLoading ? null : resolvedN },
        ]}
        value={statusTab}
        onChange={setStatusTab}
        label="Estado de los incidentes"
        testId="incidents-tabs"
      />
      <p className="-mt-2 text-xs text-muted-foreground">Los conteos son de los incidentes ya cargados (de a {PAGE_SIZE}).</p>

      <ListCard testId="incidents-list">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando incidentes" /></div>
        ) : displayed.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={statusTab === 'pending' ? 'Sin incidentes pendientes' : 'Todavía no resolviste ninguno'} />
        ) : displayed.map((inc: any, i: number) => {
          const released = inc.type === 'released';
          return (
            <ListRow
              key={inc.id}
              index={i}
              testId="incident-row"
              className="flex-wrap sm:flex-nowrap"
              leading={
                <span className={cn('grid h-[2.25rem] w-[2.25rem] shrink-0 place-items-center rounded-[0.75rem]', released ? 'bg-destructive/15 text-destructive-ink' : 'bg-warning/15 text-warning-ink')} aria-hidden="true">
                  {released ? <XCircle className="h-[1.1rem] w-[1.1rem]" /> : <AlertTriangle className="h-[1.1rem] w-[1.1rem]" />}
                </span>
              }
              title={<>{inc.driverName || 'Repartidor'} <span className="font-normal text-muted-foreground">· {inc.storeName || 'Tienda desconocida'}</span></>}
              subtitle={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge kind="incident" value={inc.type} resolved={inc.resolved === true} />
                  <span>{formatDate(inc.createdAt)}</span>
                </span>
              }
              actions={
                <div className="flex w-full items-center gap-2 pl-12 sm:w-auto sm:pl-0">
                  <Button variant="outline" size="sm" className="min-h-[40px]" asChild>
                    <Link href={`/admin/orders/${inc.orderId}`}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Ver pedido
                    </Link>
                  </Button>
                  {statusTab === 'pending' && (
                    <Button size="sm" className="min-h-[40px]" onClick={() => handleResolve(inc.id)} disabled={resolving === inc.id}>
                      {resolving === inc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Guardando" /> : 'Marcar resuelto'}
                    </Button>
                  )}
                </div>
              }
            >
              {inc.reason && <p className="mt-1 text-sm text-foreground/90">{inc.reason}</p>}
            </ListRow>
          );
        })}
      </ListCard>

      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button variant="outline" className="min-h-[44px]" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Cargar más
          </Button>
        </div>
      )}
    </AdminPage>
  );
}

export default function AdminIncidentsPageGuarded() {
  return <AdminAuthGuard><AdminIncidentsPage /></AdminAuthGuard>;
}
