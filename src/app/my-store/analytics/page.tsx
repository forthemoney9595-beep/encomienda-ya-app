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
import { ShoppingBag, User, XCircle, TrendingUp, Package, Clock, Star } from 'lucide-react';
import { format, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { type Period, PERIOD_LABELS, getPeriodBounds } from '@/lib/analytics-period';
import { PctBadge } from '@/components/pct-badge';

const formatDate = (date: any) => {
    if (!date) return '';
    try {
        const d = date.toDate ? date.toDate() : new Date(date);
        return format(d, "d MMM, HH:mm", { locale: es });
    } catch (e) { return '' }
};

function computeStats(orders: Order[], from: Date | null, to?: Date | null) {
    const filtered = orders.filter(o => {
        const d: Date = o.createdAt && (o.createdAt as any).toDate ? (o.createdAt as any).toDate() : new Date(o.createdAt as any);
        if (from && d < from) return false;
        if (to && d >= to) return false;
        return true;
    });
    const completed = filtered.filter(o => o.status === 'Entregado');
    const rejected = filtered.filter(o => o.status === 'Rechazado' || o.status === 'Cancelado');
    const totalRevenue = completed.reduce((sum, o) => sum + (o.total || 0), 0);
    const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;
    return { totalRevenue, totalOrders: filtered.length, completedOrders: completed.length, rejectedCount: rejected.length, avgTicket, orders: filtered };
}

export default function StoreAnalyticsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('30d');

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  const storeQuery = useMemoFirebase(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: userStores, isLoading: storeLoading } = useCollection<any>(storeQuery);
  const myStore = userStores && userStores.length > 0 ? userStores[0] : null;
  const storeId = myStore?.id;

  const { from, prevFrom, prevTo } = useMemo(() => getPeriodBounds(period), [period]);

  // Para poder comparar con el período anterior, la consulta arranca desde prevFrom
  // (no desde from). Eso permite calcular ambos períodos con un solo listener.
  const analyticsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    const base = [
        collection(firestore, 'orders'),
        where('storeId', '==', storeId),
        orderBy('createdAt', 'desc'),
    ];
    if (prevFrom) {
        // Agrega la restricción de fecha: solo trae a partir del período anterior
        return query(collection(firestore, 'orders'),
            where('storeId', '==', storeId),
            where('createdAt', '>=', Timestamp.fromDate(prevFrom)),
            orderBy('createdAt', 'desc')
        );
    }
    return query(collection(firestore, 'orders'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));
  }, [firestore, storeId, prevFrom?.toISOString()]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(analyticsQuery);

  const { current, prev, hasPrev } = useMemo(() => {
    if (!orders) return { current: computeStats([], null), prev: computeStats([], null), hasPrev: false };
    const cur = computeStats(orders, from);
    if (!prevFrom || !prevTo) return { current: cur, prev: computeStats([], null), hasPrev: false };
    const prv = computeStats(orders, prevFrom, prevTo);
    // Solo tiene sentido comparar si el período anterior tuvo algún pedido --
    // si no, cualquier "% de cambio" sería contra la nada, no un dato real.
    return { current: cur, prev: prv, hasPrev: prv.totalOrders > 0 };
  }, [orders, from, prevFrom, prevTo]);

  // Gráfico de ventas por día (solo cuando hay rango acotado)
  const dailySalesData = useMemo(() => {
    if (!from || period === 'all') return null;
    const completed = current.orders.filter(o => o.status === 'Entregado');
    const days = eachDayOfInterval({ start: from, end: new Date() });
    return days.map(day => ({
      day: format(day, 'd/M', { locale: es }),
      ventas: completed
        .filter(o => {
          const d = o.createdAt && (o.createdAt as any).toDate ? (o.createdAt as any).toDate() : new Date(o.createdAt as any);
          return isSameDay(d, day);
        })
        .reduce((sum, o) => sum + (o.total || 0), 0),
    }));
  }, [current.orders, from, period]);

  // Top 5 productos por ingresos
  const topProducts = useMemo(() => {
    const completed = current.orders.filter(o => o.status === 'Entregado');
    const map: Record<string, { name: string; units: number; revenue: number }> = {};
    completed.forEach(o => {
      ((o as any).items || []).forEach((item: any) => {
        const name = item.name || item.title || 'Producto';
        if (!map[name]) map[name] = { name, units: 0, revenue: 0 };
        map[name].units += item.quantity || 1;
        map[name].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [current.orders]);

  // Horas pico (cantidad de pedidos por hora del día)
  const peakHoursData = useMemo(() => {
    const counts = Array(24).fill(0);
    current.orders.forEach(o => {
      try {
        const d = (o.createdAt as any)?.toDate ? (o.createdAt as any).toDate() : new Date(o.createdAt as any);
        counts[d.getHours()]++;
      } catch {}
    });
    return counts.map((count, h) => ({ hora: `${String(h).padStart(2,'0')}hs`, pedidos: count }));
  }, [current.orders]);

  if (authLoading || ordersLoading || storeLoading) {
    return (
        <div className="container mx-auto space-y-4 pb-20">
            <PageHeader title="Analíticas" description="Cargando datos..." />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
        </div>
    );
  }

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title={`Analíticas: ${myStore?.name || 'Mi Tienda'}`}
        description="Resumen de rendimiento y ventas, agrupado por fecha del pedido. (Las analíticas del repartidor agrupan por fecha de entrega.)"
      />

      {/* Selector de período */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                    period === p
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}
            >
                {PERIOD_LABELS[p]}
            </button>
        ))}
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Totales</CardTitle>
            <ShoppingBag className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${current.totalRevenue.toLocaleString()}</div>
            <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-muted-foreground">{PERIOD_LABELS[period]}</p>
                {hasPrev && <PctBadge current={current.totalRevenue} prev={prev.totalRevenue} />}
            </div>
            {/* Es el total BRUTO que pagó el cliente: incluye el envío (va al repartidor) y
                la tarifa de servicio + comisión (van a la plataforma). Sin esta aclaración se
                leía como "lo que voy a cobrar" y no coincidía con la billetera. */}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Bruto: incluye envío y comisiones.{' '}
              <Link href="/my-store/wallet" className="text-primary underline underline-offset-2">
                Ver lo que cobrás
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregados</CardTitle>
            <Package className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current.completedOrders}</div>
            <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-muted-foreground">De {current.totalOrders} totales</p>
                {hasPrev && <PctBadge current={current.completedOrders} prev={prev.completedOrders} />}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(current.avgTicket).toLocaleString('es-AR')}</div>
            <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-muted-foreground">Valor medio por venta</p>
                {hasPrev && <PctBadge current={current.avgTicket} prev={prev.avgTicket} />}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelados</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{current.rejectedCount}</div>
            <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-muted-foreground">Pedidos no concretados</p>
                {hasPrev && current.rejectedCount > 0 && (
                    // Para cancelados, "subir" es malo -- invertimos la lógica de color
                    <PctBadge current={prev.rejectedCount} prev={current.rejectedCount} />
                )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de ventas por día. overflow-hidden (Fase QQ): los ticks de recharts
          desbordaban el Card unos px y toda la página scrolleaba horizontal en celular. */}
      {dailySalesData && dailySalesData.length > 0 && (
        <Card className="shadow-md min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> Ventas por día</CardTitle>
            <CardDescription>Ingresos de pedidos entregados — {PERIOD_LABELS[period]}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ ventas: { label: "Ventas ($)", color: "hsl(var(--chart-1))" }}} className="h-[220px] w-full">
              <BarChart data={dailySalesData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} className="text-muted-foreground text-xs" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} className="text-muted-foreground text-xs" />
                <ChartTooltip content={<ChartTooltipContent formatter={(v: any) => `$${Number(v).toLocaleString()}`} />} />
                <Bar dataKey="ventas" fill="var(--color-ventas)" radius={[4,4,0,0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Top productos + Horas pico */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Top 5 productos */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-warning" /> Top productos</CardTitle>
            <CardDescription>Más vendidos por ingresos — {PERIOD_LABELS[period]}</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin pedidos entregados en este período.</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => {
                  const maxRev = topProducts[0].revenue;
                  const pct = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium line-clamp-1">{i + 1}. {p.name}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{p.units} un. · ${p.revenue.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Horas pico */}
        <Card className="shadow-md min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-info" /> Horas pico</CardTitle>
            <CardDescription>Cuándo llegan más pedidos — {PERIOD_LABELS[period]}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ pedidos: { label: "Pedidos", color: "hsl(var(--chart-4))" }}} className="h-[220px] w-full">
              <BarChart data={peakHoursData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hora" tickLine={false} axisLine={false} tickMargin={8} className="text-muted-foreground text-xs"
                  interval={3} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-muted-foreground text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="pedidos" fill="var(--color-pedidos)" radius={[4,4,0,0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

      </div>

      {/* Lista de movimientos del período */}
      <Card className="col-span-4 shadow-md">
        <CardHeader>
          <CardTitle>Movimientos — {PERIOD_LABELS[period]}</CardTitle>
          <CardDescription>
            {current.orders.length > 0
                ? `${current.orders.length} pedidos en el período seleccionado.`
                : 'No hay pedidos en este período.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {current.orders.slice(0, 10).map(order => (
                <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-info/15 text-info flex items-center justify-center shrink-0 group-hover:bg-info/25 transition-colors">
                            <User className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold leading-none">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)} • ID: {order.id.slice(0,6)}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        {/* Fase PP (N8): un pedido CANCELADO se mostraba como "+$X" en verde,
                            como si fuera plata que entró. Solo los entregados van en verde
                            con +; el resto en gris y sin signo. */}
                        <div className={cn('font-bold',
                            order.status === 'Entregado' ? 'text-success' : 'text-muted-foreground')}>
                            {order.status === 'Entregado' ? '+' : ''}${order.total.toLocaleString()}
                        </div>
                        <Badge variant="outline" className={cn('text-[10px] uppercase',
                            order.status === 'Entregado' ? 'bg-success/15 text-success border-success/30' :
                            order.status === 'Rechazado' ? 'bg-destructive/15 text-destructive border-destructive/30' :
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
