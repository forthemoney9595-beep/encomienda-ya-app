'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRequireRole } from '@/hooks/use-require-role';
import { money } from '@/lib/format-money';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import type { Order } from '@/lib/order-service';
import { driverNetForOrder } from '@/lib/money';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Truck, CreditCard, Wallet, History, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns'; 
import { es } from 'date-fns/locale'; 
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { DriverTabsList } from '@/components/driver-tabs';
import { cn } from '@/lib/utils';
import { WalletStatement } from '@/components/wallet-statement';
import { FALLBACK_COMMISSION } from '@/lib/money';

// ✅ FUNCIÓN AUXILIAR: Maneja fechas de forma segura
const formatDate = (date: any) => {
    if (!date) return 'Fecha desc.';
    try {
        let dateObj: Date;
        if (typeof date.toDate === 'function') {
             dateObj = date.toDate();
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            return 'Fecha desc.';
        }
        return format(dateObj, "d MMM HH:mm", { locale: es });
    } catch (error) {
        return 'Fecha desc.';
    }
};

export default function DeliveryEarningsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  // Estados para el formulario de retiro
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [cbu, setCbu] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyTab, setHistoryTab] = useState('withdrawals');

  // 1. Seguridad: Redirigir si no es repartidor
  // ARQ-010: guard único + `ready` para no armar consultas antes de confirmar el rol.
  const { ready } = useRequireRole('delivery');

  // 2. Traer TODAS las órdenes entregadas (INGRESOS)
  const earningsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || !ready) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', user.uid),
      where('status', '==', 'Entregado'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user?.uid, ready]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(earningsQuery);

  // 3. Traer TODOS los retiros (EGRESOS)
  const withdrawalsQuery = useMemoFirebase(() => {
      if (!firestore || !user?.uid || !ready) return null;
      return query(
          collection(firestore, 'withdrawals'),
          where('userId', '==', user.uid),
          where('userRole', '==', 'delivery'),
          orderBy('createdAt', 'desc')
      );
  }, [firestore, user?.uid, ready]);

  const { data: withdrawals, isLoading: withdrawalsLoading } = useCollection<any>(withdrawalsQuery);

  // Día de liquidación (config/platform.settlementDayOfWeek) para "Próxima liquidación".
  const configRef = useMemoFirebase(() => (firestore && ready ? doc(firestore, 'config', 'platform') : null), [firestore, ready]);
  const { data: platformConfig } = useDoc<{ settlementDayOfWeek?: number }>(configRef);

  // 4. Cálculos Financieros
  const financialSummary = useMemo(() => {
      const deliveredOrders = orders || [];
      const withdrawalHistory = withdrawals || [];

      // Misma función que usa el servidor al aprobar un retiro (src/lib/money.ts). Antes
      // esta fórmula estaba escrita aparte y se desincronizaba con el servidor cada vez que
      // se corregía una de las dos.
      const totalEarned = deliveredOrders.reduce((sum, order) => sum + driverNetForOrder(order), 0);
      
      // Total retirado (Aprobado o Pendiente cuenta como "no disponible")
      const totalWithdrawn = withdrawalHistory
          .filter(w => w.status !== 'rejected') // Ignoramos los rechazados, esos vuelven al saldo
          .reduce((sum, w) => sum + (w.amount || 0), 0);

      const availableBalance = totalEarned - totalWithdrawn;
      const settled = withdrawalHistory.filter(w => w.status === 'approved').reduce((sum, w) => sum + (w.amount || 0), 0);

      return {
          totalEarned,
          totalWithdrawn,
          debt: Math.max(0, settled - totalEarned),
          availableBalance: Math.max(0, availableBalance), // Evitar negativos visuales
          deliveredOrders
      };
  }, [orders, withdrawals]);

  // 5. Manejar Solicitud de Retiro
  const handleRequestWithdrawal = async () => {
      if (!firestore || !user) return;
      
      const amount = parseFloat(withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
          toast({ variant: "destructive", title: "Monto inválido" });
          return;
      }
      if (amount > financialSummary.availableBalance) {
          toast({ variant: "destructive", title: "Saldo insuficiente" });
          return;
      }
      if (!cbu || cbu.length < 5) {
          toast({ variant: "destructive", title: "Ingresa un CBU/Alias válido" });
          return;
      }

      setIsSubmitting(true);
      try {
          // Va por API: el saldo se valida en el SERVIDOR (misma fórmula que la aprobación).
          // Antes era un addDoc directo — desde la consola se podía crear un retiro de
          // cualquier monto, y eso congelaba la liquidación automática de esta cuenta.
          // La API también guarda el CBU para las liquidaciones.
          const res = await authedFetch('/api/withdrawals/request', user, {
              role: 'delivery', amount, cbu,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al solicitar retiro');

          toast({
              title: "Solicitud enviada",
              description: "El administrador revisará tu retiro pronto."
          });
          setIsWithdrawOpen(false);
          setWithdrawAmount('');
          // No borramos el CBU para que sea cómodo la próxima vez (opcional)
      } catch (error: any) {
          console.error(error);
          toast({ variant: "destructive", title: "Error al solicitar retiro", description: error.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  if (authLoading || ordersLoading || withdrawalsLoading) {
    return (
        <div className="mx-auto w-full max-w-3xl space-y-4 pb-20">
            <PageHeader title="Mis ganancias" description="Calculando tu saldo…" />
            <Skeleton className="h-44 w-full rounded-card" />
            <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-24 rounded-card" />
                <Skeleton className="h-24 rounded-card" />
            </div>
        </div>
    );
  }

  const canWithdraw = financialSummary.availableBalance >= 1;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-20">
      <PageHeader
        title="Mis ganancias"
        description={`Saldo, retiros y entregas de ${userProfile?.displayName || 'tu cuenta'}.`}
      />

      {/* SALDO DISPONIBLE: lo más importante de la pantalla, en verde de plata */}
      <section className="glass-strong rounded-card p-5" aria-labelledby="saldo-titulo" data-testid="driver-balance">
          <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                  <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                  <h2 id="saldo-titulo" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Saldo disponible</h2>
                  <p className="text-sm text-muted-foreground">Plata lista para retirar</p>
              </div>
          </div>
          <p className="mt-3 font-headline text-[3.25rem] font-extrabold leading-[0.9] tabular-nums text-success">
              {money(financialSummary.availableBalance)}
          </p>

          <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
              <DialogTrigger asChild>
                  <Button disabled={!canWithdraw} className="mt-4 h-12 w-full rounded-2xl text-base font-bold sm:w-auto sm:px-8">
                      Solicitar retiro
                  </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100%-1.5rem)] rounded-card sm:rounded-card">
                  <DialogHeader>
                      <DialogTitle className="font-headline text-2xl font-extrabold">Solicitar transferencia</DialogTitle>
                      <DialogDescription className="text-base">
                          Te la mandamos a tu cuenta bancaria o de MercadoPago cuando la apruebe la administración.
                      </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                      <div className="space-y-2">
                          <Label htmlFor="withdraw-amount">Monto a retirar</Label>
                          <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                  id="withdraw-amount"
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={Math.floor(financialSummary.availableBalance)}
                                  required
                                  placeholder="0"
                                  className="h-12 rounded-2xl pl-8 text-lg font-bold"
                                  value={withdrawAmount}
                                  onChange={(e) => setWithdrawAmount(e.target.value)}
                              />
                          </div>
                          <p className="text-sm text-muted-foreground">Máximo disponible: {money(financialSummary.availableBalance)}</p>
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="withdraw-cbu">CBU, CVU o alias</Label>
                          <Input
                              id="withdraw-cbu"
                              placeholder="Ej: mi.alias.mp"
                              className="h-12 rounded-2xl"
                              value={cbu}
                              onChange={(e) => setCbu(e.target.value)}
                          />
                      </div>
                  </div>
                  <DialogFooter className="gap-2">
                      <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setIsWithdrawOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                      <Button className="h-12 rounded-2xl" onClick={handleRequestWithdrawal} disabled={isSubmitting || !(Number(withdrawAmount) > 0) || Number(withdrawAmount) > financialSummary.availableBalance || cbu.trim().length < 5}>
                          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirmar
                      </Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>
      </section>

      {/* METRICAS SECUNDARIAS */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-card p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <TrendingUp className="h-4 w-4" aria-hidden="true" /> Ganado en total
            </p>
            <p className="mt-1 font-headline text-3xl font-extrabold tabular-nums">{money(financialSummary.totalEarned)}</p>
        </div>
        <div className="glass rounded-card p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <History className="h-4 w-4" aria-hidden="true" /> Retirado
            </p>
            <p className="mt-1 font-headline text-3xl font-extrabold tabular-nums text-muted-foreground">{money(financialSummary.totalWithdrawn)}</p>
        </div>
      </div>

      {/* Estado de cuenta + día de cobro (Fase YY bis): mismas fórmulas que la ficha del admin. */}
      <WalletStatement
          role="delivery"
          uid={user?.uid}
          fallbackRate={FALLBACK_COMMISSION}
          withdrawals={withdrawals || []}
          balance={financialSummary.availableBalance}
          debt={financialSummary.debt}
          settlementDayOfWeek={platformConfig?.settlementDayOfWeek}
          hasCbu={!!userProfile?.payoutCbu}
          ready={ready && !!user?.uid}
      />

      {/* PESTAÑAS DE HISTORIAL */}
      <Tabs value={historyTab} onValueChange={setHistoryTab} className="w-full">
          <DriverTabsList
              value={historyTab}
              className="mb-3"
              items={[
                  { value: 'withdrawals', label: 'Retiros' },
                  { value: 'earnings', label: 'Entregas' },
              ]}
          />

          {/* RETIROS */}
          <TabsContent value="withdrawals" className="mt-0">
              {(!withdrawals || withdrawals.length === 0) ? (
                  <div className="glass rounded-card px-5 py-8 text-center text-muted-foreground">
                      Todavía no pediste ningún retiro.
                  </div>
              ) : (
                  <ul className="glass divide-y divide-foreground/10 overflow-hidden rounded-card" aria-label="Historial de retiros">
                      {withdrawals.map((w: any) => (
                          <li key={w.id} className="space-y-1.5 px-4 py-3.5">
                              <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-headline text-xl font-extrabold tabular-nums">{money(w.amount || 0)}</p>
                                          {w.source === 'auto' && <Badge variant="outline" className="border-primary/40 text-xs text-primary">Automático</Badge>}
                                      </div>
                                      <p className="text-sm text-muted-foreground">{formatDate(w.createdAt)}</p>
                                  </div>
                                  <Badge variant={
                                      w.status === 'approved' ? 'default' :
                                      w.status === 'rejected' ? 'destructive' : 'secondary'
                                  } className={cn('shrink-0', w.status === 'approved' ? 'bg-success text-success-foreground hover:bg-success/90' : w.status === 'pending' ? 'bg-warning text-warning-foreground hover:bg-warning/90' : '')}>
                                      {w.status === 'approved' ? 'Pagado' :
                                       w.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                                  </Badge>
                              </div>
                              {/* El motivo del rechazo se guardaba pero no se mostraba: el
                                  repartidor veía "Rechazado" sin saber qué corregir. */}
                              {w.status === 'rejected' && w.rejectionReason && (
                                  <p className="rounded-xl bg-destructive/10 px-3 py-1.5 text-sm text-muted-foreground">
                                      {w.rejectionReason}
                                  </p>
                              )}
                              {/* Comprobante de la transferencia real, para poder rastrearla. */}
                              {w.status === 'approved' && w.operationRef && (
                                  <p className="text-sm text-muted-foreground">
                                      Comprobante: <span className="font-mono">{w.operationRef}</span>
                                      {w.processedAt && ` · ${formatDate(w.processedAt)}`}
                                  </p>
                              )}
                          </li>
                      ))}
                  </ul>
              )}
          </TabsContent>

          {/* ENTREGAS (ingresos) */}
          <TabsContent value="earnings" className="mt-0">
            {financialSummary.deliveredOrders.length === 0 ? (
                <div className="glass rounded-card px-5 py-10 text-center text-muted-foreground">
                    <Truck className="mx-auto mb-2 h-8 w-8 opacity-60" aria-hidden="true" />
                    <p>Todavía no completaste ninguna entrega.</p>
                </div>
            ) : (
                <ul className="glass divide-y divide-foreground/10 overflow-hidden rounded-card" aria-label="Historial de entregas">
                    {financialSummary.deliveredOrders.map((order) => (
                        <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                            <div className="min-w-0">
                                <p className="truncate font-semibold">{order.storeName}</p>
                                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" /> Pago digital · {formatDate(order.createdAt)}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                {/* Neto (Fase PP, N4): antes mostraba deliveryFee crudo y las
                                    filas no sumaban el titular de la misma pantalla. */}
                                <span className="block font-headline text-xl font-extrabold tabular-nums text-success">
                                    +{money(driverNetForOrder(order as any))}
                                </span>
                                {(order as any).refunded && (
                                    <span className="block text-sm text-info">reembolso aplicado</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
          </TabsContent>
      </Tabs>
    </div>
  );
}
