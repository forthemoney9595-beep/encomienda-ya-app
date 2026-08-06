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
  // Anomalías que antes no dejaban ningún registro (ver webhook y /api/orders/cancel).
  payment_reversed: 'Pago revertido en MercadoPago',
  duplicate_payment: 'Doble pago del mismo pedido',
  cancelled_after_payment: 'Cancelado con el pago hecho',
};

// Qué tiene que hacer el admin con cada tipo. Sin esto, "marcar resuelto" es un botón que
// hace desaparecer una alerta de plata sin que quede claro qué acción correspondía.
const REASON_HINTS: Record<string, string> = {
  amount_mismatch: 'Verificá en MercadoPago cuánto entró realmente y ajustá o reembolsá la diferencia.',
  unexpected_order_status: 'El pago llegó tarde. Decidí si reactivás el pedido o devolvés la plata.',
  payment_reversed: 'MercadoPago devolvió o retuvo esta plata. Si el pedido se entregó, es una pérdida a registrar.',
  duplicate_payment: 'El comprador pagó dos veces. Hay que devolverle uno de los dos pagos.',
  cancelled_after_payment: 'El pedido se canceló con la plata ya cobrada: corresponde reembolsar al comprador.',
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
    // Una discrepancia de pago es plata que no cuadra: "resuelto" sin decir CÓMO no sirve
    // de nada dentro de seis meses. La nota es obligatoria y queda en el registro y en el
    // log de acciones.
    const note = window.prompt('¿Cómo se resolvió? (ej: "MP retuvo el pago, se devolvió al cliente el 12/8")');
    if (note === null) return;
    if (note.trim().length < 4) {
      toast({ variant: 'destructive', title: 'Falta la explicación', description: 'Escribí qué se hizo con esa plata.' });
      return;
    }
    setResolving(id);
    try {
      await updateDoc(doc(firestore, 'payment_mismatches', id), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: user.uid,
        resolutionNote: note.trim().slice(0, 300),
      });
      logAdminAction(firestore, user.uid, 'resolve_payment_mismatch', id, note.trim().slice(0, 200));
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
                    ) : m.reason === 'unexpected_order_status' ? (
                      <>Pago recibido con la orden en estado <strong>&quot;{m.orderStatus}&quot;</strong> (esperaba &quot;Pendiente de Pago&quot;)</>
                    ) : m.reason === 'duplicate_payment' ? (
                      <>Se cobró <strong>${m.paidAmount?.toLocaleString()}</strong> de nuevo sobre un pedido ya pagado</>
                    ) : m.reason === 'payment_reversed' ? (
                      <>MercadoPago revirtió <strong>${m.paidAmount?.toLocaleString()}</strong> (estado: {m.mpStatus})</>
                    ) : m.reason === 'cancelled_after_payment' ? (
                      <>Se canceló con <strong>${m.paidAmount?.toLocaleString()}</strong> ya cobrados (canceló: {m.cancelledBy})</>
                    ) : (
                      <>Revisar manualmente</>
                    )}
                  </p>
                  {/* Qué corresponde hacer: sin esto "marcar resuelto" es un botón que borra
                      una alerta de plata sin dejar claro qué acción había que tomar. */}
                  {REASON_HINTS[m.reason] && (
                    <p className="text-xs text-warning">{REASON_HINTS[m.reason]}</p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono">
                    Payment ID: {m.paymentId || '—'}
                    {m.previousPaymentId ? ` · anterior: ${m.previousPaymentId}` : ''}
                  </p>
                  {/* En la pestaña de resueltos, quién y cuándo lo resolvió (el dato ya se
                      guardaba pero no se mostraba en ningún lado). */}
                  {m.resolved && (
                    <p className="text-[11px] text-muted-foreground">
                      Resuelto {m.resolvedAt ? formatDate(m.resolvedAt) : ''}{m.resolvedBy ? ` · por ${String(m.resolvedBy).slice(0, 8)}…` : ''}
                    </p>
                  )}
                  {m.resolved && m.resolutionNote && (
                    <p className="mt-1 rounded border-l-2 border-success/40 bg-success/5 px-2 py-1 text-xs">
                      {m.resolutionNote}
                    </p>
                  )}
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
