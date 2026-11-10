'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRequireRole } from '@/hooks/use-require-role';
import { money } from '@/lib/format-money';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Truck, TrendingUp, Clock, Store as StoreIcon } from 'lucide-react';
import { format, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { driverNetForOrder } from '@/lib/money';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { type Period, PERIOD_LABELS, getPeriodBounds } from '@/lib/analytics-period';
import { PctBadge } from '@/components/pct-badge';
import { DriverSegmented } from '@/components/driver-tabs';

const formatDate = (date: any) => {
  if (!date) return '';
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return format(d, "d MMM, HH:mm", { locale: es });
  } catch { return ''; }
};

// A diferencia de la tienda, "cuándo pasó" una entrega es deliveredAt (si existe), no
// createdAt -- un pedido tomado un día y entregado al otro debe contar para el día que
// se entregó.
const orderDate = (o: any): Date => {
  const ts = o.deliveredAt || o.createdAt;
  return ts?.toDate ? ts.toDate() : new Date(ts);
};

function computeStats(orders: Order[], from: Date | null, to?: Date | null) {
  const filtered = orders.filter(o => {
    const d = orderDate(o);
    if (from && d < from) return false;
    if (to && d >= to) return false;
    return true;
  });
  const completed = filtered.filter(o => o.status === 'Entregado');
  // Mismo criterio que la billetera y que el servidor (src/lib/money.ts): descuenta la parte
  // reembolsada y excluye los pedidos en efectivo. Antes era `o.deliveryFee` a secas, así que
  // las analíticas mostraban una ganancia mayor a la que después se podía retirar.
  const totalEarned = completed.reduce((sum, o) => sum + driverNetForOrder(o as any), 0);
  const avgEarning = completed.length > 0 ? totalEarned / completed.length : 0;
  return { totalEarned, completedCount: completed.length, avgEarning, orders: filtered };
}

export default function DeliveryAnalyticsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('30d');

  // ARQ-010: guard único + `ready` para no armar consultas antes de confirmar el rol.
  const { ready } = useRequireRole('delivery');

  const { from, prevFrom, prevTo } = useMemo(() => getPeriodBounds(period), [period]);

  // Igual que en my-store/analytics: la consulta arranca desde prevFrom para poder
  // calcular ambos períodos (actual + anterior) con un solo listener.
  // 🚨 Fase PP (N9): la query filtra por CREACIÓN pero los buckets agrupan por ENTREGA —
  // un pedido creado antes del corte y entregado dentro del período no se bajaba y
  // faltaba plata. El margen de 7 días cubre cualquier pedido "a caballo" realista.
  const analyticsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !ready) return null;
    if (prevFrom) {
      const buffered = new Date(prevFrom.getTime() - 7 * 86_400_000);
      return query(collection(firestore, 'orders'),
        where('deliveryPersonId', '==', user.uid),
        where('createdAt', '>=', Timestamp.fromDate(buffered)),
        orderBy('createdAt', 'desc')
      );
    }
    return query(collection(firestore, 'orders'), where('deliveryPersonId', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [firestore, user, ready, prevFrom?.toISOString()]); // ready: sin él la consulta quedaba en null para siempre tras el guard (bug de ARQ-010)

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(analyticsQuery);

  const { current, prev, hasPrev } = useMemo(() => {
    if (!orders) return { current: computeStats([], null), prev: computeStats([], null), hasPrev: false };
    const cur = computeStats(orders, from);
    if (!prevFrom || !prevTo) return { current: cur, prev: computeStats([], null), hasPrev: false };
    const prv = computeStats(orders, prevFrom, prevTo);
    return { current: cur, prev: prv, hasPrev: prv.completedCount > 0 };
  }, [orders, from, prevFrom, prevTo]);

  const dailyEarningsData = useMemo(() => {
    if (!from || period === 'all') return null;
    const completed = current.orders.filter(o => o.status === 'Entregado');
    const days = eachDayOfInterval({ start: from, end: new Date() });
    return days.map(day => ({
      day: format(day, 'd/M', { locale: es }),
      ganancias: completed.filter(o => isSameDay(orderDate(o), day)).reduce((sum, o) => sum + driverNetForOrder(o as any), 0),
    }));
  }, [current.orders, from, period]);

  const peakHoursData = useMemo(() => {
    const counts = Array(24).fill(0);
    current.orders.forEach(o => {
      try { counts[orderDate(o).getHours()]++; } catch {}
    });
    return counts.map((count, h) => ({ hora: `${String(h).padStart(2, '0')}hs`, entregas: count }));
  }, [current.orders]);

  if (authLoading || ordersLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 pb-20">
        <PageHeader title="Analíticas" description="Cargando datos…" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-20">
      <PageHeader title="Analíticas" description="Resumen de tu actividad como repartidor, agrupado por fecha de entrega (netos, ya con reembolsos descontados)." />

      <DriverSegmented
        label="Período"
        value={period}
        onChange={(v) => setPeriod(v as Period)}
        items={(Object.keys(PERIOD_LABELS) as Period[]).map(p => ({ value: p, label: PERIOD_LABELS[p], testId: `period-${p}` }))}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ganancias Totales</CardTitle>
            <Wallet className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="font-headline text-3xl font-extrabold tabular-nums text-success">{money(current.totalEarned)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-sm text-muted-foreground">{PERIOD_LABELS[period]}</p>
              {hasPrev && <PctBadge current={current.totalEarned} prev={prev.totalEarned} />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregas Completadas</CardTitle>
            <Truck className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="font-headline text-3xl font-extrabold tabular-nums" data-testid="analytics-completed">{current.completedCount}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-sm text-muted-foreground">{PERIOD_LABELS[period]}</p>
              {hasPrev && <PctBadge current={current.completedCount} prev={prev.completedCount} />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ganancia Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="font-headline text-3xl font-extrabold tabular-nums">{money(current.avgEarning)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-sm text-muted-foreground">Por entrega</p>
              {hasPrev && <PctBadge current={current.avgEarning} prev={prev.avgEarning} />}
            </div>
          </CardContent>
        </Card>
      </div>

      {dailyEarningsData && dailyEarningsData.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline text-2xl font-extrabold"><TrendingUp className="h-5 w-5 text-success" /> Ganancias por día</CardTitle>
            <CardDescription>{PERIOD_LABELS[period]}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ ganancias: { label: "Ganancias ($)", color: "hsl(var(--chart-1))" } }} className="h-[220px] w-full">
              <BarChart data={dailyEarningsData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} className="text-muted-foreground text-xs" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`)} allowDecimals={false} className="text-muted-foreground text-xs" />
                <ChartTooltip content={<ChartTooltipContent formatter={(v: any) => `${money(Number(v))}`} />} />
                <Bar dataKey="ganancias" fill="var(--color-ganancias)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline text-2xl font-extrabold"><Clock className="h-5 w-5 text-info" /> Horas pico</CardTitle>
          <CardDescription>Cuándo hacés más entregas — {PERIOD_LABELS[period]}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ entregas: { label: "Entregas", color: "hsl(var(--chart-4))" } }} className="h-[220px] w-full">
            <BarChart data={peakHoursData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="hora" tickLine={false} axisLine={false} tickMargin={8} className="text-muted-foreground text-xs" interval={3} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-muted-foreground text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="entregas" fill="var(--color-entregas)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="font-headline text-2xl font-extrabold">Movimientos — {PERIOD_LABELS[period]}</CardTitle>
          <CardDescription>
            {current.orders.length > 0 ? `${current.orders.length} pedidos en el período seleccionado.` : 'No hay pedidos en este período.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 divide-y divide-foreground/10 sm:-mx-3">
            {current.orders.slice(0, 10).map(order => (
              <Link key={order.id} href={`/orders/${order.id}`} className="group flex min-h-[3.75rem] items-center justify-between gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-foreground/[0.05] sm:px-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <StoreIcon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-semibold leading-tight">{order.storeName}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(orderDate(order))} · #{order.id.slice(0, 6)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {/* Solo los entregados suman (misma regla que las analíticas de la tienda, Fase PP N8):
                      un cancelado no se pinta como "+$X" en verde. */}
                  {order.status === 'Entregado'
                    ? <div className="font-headline text-lg font-extrabold tabular-nums text-success">+{money(driverNetForOrder(order as any))}</div>
                    : <div className="text-sm text-muted-foreground">Sin cobro</div>}
                  <Badge variant="outline" className={cn('text-xs uppercase',
                    order.status === 'Entregado' ? 'bg-success/15 text-success border-success/30' :
                    order.status === 'Cancelado' ? 'bg-destructive/15 text-destructive border-destructive/30' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {order.status}
                  </Badge>
                </div>
              </Link>
            ))}
            {current.orders.length === 0 && (
              <div className="rounded-2xl bg-foreground/[0.04] py-8 text-center text-muted-foreground">
                <p>Acá van a aparecer tus entregas a medida que las completes.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
