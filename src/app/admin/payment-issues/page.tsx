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
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const REASON_LABELS: Record<string, string> = {
  amount_mismatch: 'Monto no coincide',
  unexpected_order_status: 'Estado de orden inesperado',
};

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy HH:mm", { locale: es }); } catch { return '—'; }
};

function AdminPaymentIssuesPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [resolving, setResolving] = useState<string | null>(null);

  // Colección de anomalías -- por diseño debería quedar casi siempre vacía (solo se
  // escribe cuando el webhook de MP encuentra algo raro), a diferencia de las colecciones
  // que crecen con el uso normal (orders/users). Por eso alcanza con un límite defensivo
  // en vez de la paginación por cursor que usan admin/users o admin/reviews.
  const mismatchesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'payment_mismatches'), orderBy('createdAt', 'desc'), limit(200));
  }, [firestore]);
  const { data: mismatches, isLoading } = useCollection<any>(mismatchesQuery);

  // Los registros de antes de esta fase no tienen el campo `resolved` -- se tratan como
  // pendientes (nunca se marcaron como resueltos), no se filtran con un `where` (Firestore
  // excluye del `!=` los docs sin el campo, que es justo el dato viejo que hay que mostrar).
  const pending = useMemo(() => (mismatches || []).filter(m => m.resolved !== true), [mismatches]);
  const resolved = useMemo(() => (mismatches || []).filter(m => m.resolved === true), [mismatches]);
  const displayed = tab === 'pending' ? pending : resolved;

  const handleResolve = async (id: string) => {
    if (!firestore || !user) return;
    setResolving(id);
    try {
      await updateDoc(doc(firestore, 'payment_mismatches', id), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: user.uid,
      });
      logAdminAction(firestore, user.uid, 'resolve_payment_mismatch', id);
      toast({ title: 'Marcado como resuelto' });
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
        title="Discrepancias de Pago"
        description="Pagos de MercadoPago que no coincidieron en monto o estado con el pedido -- el webhook los deja acá en vez de marcarlos pagados a ciegas."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'resolved')}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes ({pending.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resueltos ({resolved.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && displayed.length === 0 && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto opacity-30 text-success" />
            <p>{tab === 'pending' ? 'Sin discrepancias pendientes. Todo en orden.' : 'Todavía no resolviste ninguna.'}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && displayed.length > 0 && (
        <div className="space-y-3">
          {displayed.map((m: any) => (
            <Card key={m.id} className={cn('border-l-4', tab === 'pending' ? 'border-l-destructive' : 'border-l-success')}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive gap-1">
                      <AlertCircle className="h-3 w-3" /> {REASON_LABELS[m.reason] || m.reason}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</span>
                  </div>
                  <p className="text-sm">
                    {m.reason === 'amount_mismatch' ? (
                      <>Pagado <strong>${m.paidAmount?.toLocaleString()}</strong> vs. orden <strong>${m.orderTotal?.toLocaleString()}</strong></>
                    ) : (
                      <>Pago recibido con la orden en estado <strong>&quot;{m.orderStatus}&quot;</strong> (esperaba &quot;Pendiente de Pago&quot;)</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">Payment ID: {m.paymentId}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/orders/${m.orderId}`} target="_blank">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver pedido
                    </Link>
                  </Button>
                  {tab === 'pending' && (
                    <Button size="sm" onClick={() => handleResolve(m.id)} disabled={resolving === m.id}>
                      {resolving === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Marcar resuelto'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPaymentIssuesPageGuarded() {
  return <AdminAuthGuard><AdminPaymentIssuesPage /></AdminAuthGuard>;
}
