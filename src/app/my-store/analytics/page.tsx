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
import { ShoppingBag, User, XCircle, TrendingUp, Package, TrendingDown, Minus } from 'lucide-react';
import { format, subDays, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const formatDate = (date: any) => {
    if (!date) return '';
    try {
        const d = date.toDate ? date.toDate() : new Date(date);
        return format(d, "d MMM, HH:mm", { locale: es });
    } catch (e) { return '' }
};

type Period = '7d' | '30d' | 'month' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
    '7d':    'Últimos 7 días',
    '30d':   'Últimos 30 días',
    'month': 'Este mes',
    'all':   'Todo',
};

function getPeriodBounds(period: Period): { from: Date | null; prevFrom: Date | null; prevTo: Date | null } {
    const now = new Date();
    if (period === 'all') return { from: null, prevFrom: null, prevTo: null };
    if (period === '7d') {
        return { from: subDays(now, 7), prevFrom: subDays(now, 14), prevTo: subDays(now, 7) };
    }
    if (period === '30d') {
        return { from: subDays(now, 30), prevFrom: subDays(now, 60), prevTo: subDays(now, 30) };
    }
    // 'month' = current calendar month, vs same period last month
    const thisMonthStart = startOfMonth(now);
    const prevMonthStart = subMonths(thisMonthStart, 1);
    return { from: thisMonthStart, prevFrom: prevMonthStart, prevTo: thisMonthStart };
}

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

function pct(current: number, prev: number): { value: number; up: boolean; zero: boolean } {
    if (prev === 0) return { value: current > 0 ? 100 : 0, up: current > 0, zero: current === 0 };
    const v = ((current - prev) / prev) * 100;
    return { value: Math.abs(v), up: v >= 0, zero: v === 0 };
}

function PctBadge({ current, prev }: { current: number; prev: number }) {
    const p = pct(current, prev);
    if (prev === 0 && current === 0) return null;
    return (
        <span className={cn('flex items-center gap-0.5 text-xs font-medium', p.up ? 'text-success' : 'text-destructive')}>
            {p.zero ? <Minus className="h-3 w-3" /> : p.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {p.value.toFixed(0)}%
        </span>
    );
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
    return { current: cur, prev: prv, hasPrev: true };
  }, [orders, from, prevFrom, prevTo]);

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
        description="Resumen de rendimiento y ventas."
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
            <div className="text-2xl font-bold">${current.avgTicket.toFixed(0)}</div>
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
                        <div className="font-bold text-success">+${order.total.toLocaleString()}</div>
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
