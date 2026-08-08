'use client';

import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  const { from, prevFrom, prevTo } = useMemo(() => getPeriodBounds(period), [period]);

  // Igual que en my-store/analytics: la consulta arranca desde prevFrom para poder
  // calcular ambos períodos (actual + anterior) con un solo listener.
  // 🚨 Fase PP (N9): la query filtra por CREACIÓN pero los buckets agrupan por ENTREGA —
  // un pedido creado antes del corte y entregado dentro del período no se bajaba y
  // faltaba plata. El margen de 7 días cubre cualquier pedido "a caballo" realista.
  const analyticsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    if (prevFrom) {
      const buffered = new Date(prevFrom.getTime() - 7 * 86_400_000);
      return query(collection(firestore, 'orders'),
        where('deliveryPersonId', '==', user.uid),
        where('createdAt', '>=', Timestamp.fromDate(buffered)),
        orderBy('createdAt', 'desc')
      );
    }
    return query(collection(firestore, 'orders'), where('deliveryPersonId', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [firestore, user, prevFrom?.toISOString()]);

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
      <div className="container mx-auto space-y-4 pb-20">
        <PageHeader title="Analíticas" description="Cargando datos..." />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader title="Analíticas" description="Resumen de tu actividad como repartidor, agrupado por fecha de entrega (netos, ya con reembolsos descontados)." />

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              period === p ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ganancias Totales</CardTitle>
            <Wallet className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${current.totalEarned.toLocaleString()}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs text-muted-foreground">{PERIOD_LABELS[period]}</p>
              {hasPrev && <PctBadge current={current.totalEarned} prev={prev.totalEarned} />}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregas Completadas</CardTitle>
            <Truck className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current.completedCount}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs text-muted-foreground">{PERIOD_LABELS[period]}</p>
              {hasPrev && <PctBadge current={current.completedCount} prev={prev.completedCount} />}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ganancia Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${current.avgEarning.toFixed(0)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs text-muted-foreground">Por entrega</p>
              {hasPrev && <PctBadge current={current.avgEarning} prev={prev.avgEarning} />}
            </div>
          </CardContent>
        </Card>
      </div>

      {dailyEarningsData && dailyEarningsData.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> Ganancias por día</CardTitle>
            <CardDescription>{PERIOD_LABELS[period]}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ ganancias: { label: "Ganancias ($)", color: "hsl(var(--chart-1))" } }} className="h-[220px] w-full">
              <BarChart data={dailyEarningsData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} className="text-muted-foreground text-xs" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} className="text-muted-foreground text-xs" />
                <ChartTooltip content={<ChartTooltipContent formatter={(v: any) => `$${Number(v).toLocaleString()}`} />} />
                <Bar dataKey="ganancias" fill="var(--color-ganancias)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-info" /> Horas pico</CardTitle>
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

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Movimientos — {PERIOD_LABELS[period]}</CardTitle>
          <CardDescription>
            {current.orders.length > 0 ? `${current.orders.length} pedidos en el período seleccionado.` : 'No hay pedidos en este período.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {current.orders.slice(0, 10).map(order => (
              <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-info/15 text-info flex items-center justify-center shrink-0 group-hover:bg-info/25 transition-colors">
                    <StoreIcon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold leading-none">{order.storeName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(orderDate(order))} • ID: {order.id.slice(0, 6)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-bold text-success">+${Math.round(driverNetForOrder(order as any)).toLocaleString('es-AR')}</div>
                  <Badge variant="outline" className={cn('text-[10px] uppercase',
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
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>No hay movimientos en este período.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
