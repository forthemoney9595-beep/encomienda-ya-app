'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, CollectionReference, Timestamp } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, ShoppingBag, TrendingUp, CreditCard, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link'; // Importamos Link

// Helper para formatear fecha
const formatDate = (date: any) => {
    if (!date) return '';
    try {
        const d = date.toDate ? date.toDate() : new Date(date);
        return format(d, "d MMM, HH:mm", { locale: es });
    } catch (e) { return '' }
};

export default function StoreAnalyticsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', userProfile.storeId)
    ) as CollectionReference<Order>;
  }, [firestore, userProfile?.storeId]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(ordersQuery);

  const stats = useMemo(() => {
    if (!orders) return { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0, completedOrders: 0, pendingRevenue: 0, recentOrders: [] };

    const completed = orders.filter(o => o.status === 'Entregado');
    const active = orders.filter(o => ['Pendiente de Pago', 'En preparación', 'En reparto'].includes(o.status));

    const totalRevenue = completed.reduce((sum, order) => sum + order.total, 0);
    const pendingRevenue = active.reduce((sum, order) => sum + order.total, 0);
    
    // Ordenar por fecha para obtener los recientes
    const sortedOrders = [...orders].sort((a, b) => {
        const dateA = a.createdAt && (a.createdAt as any).toDate ? (a.createdAt as any).toDate().getTime() : new Date(a.createdAt as any).getTime();
        const dateB = b.createdAt && (b.createdAt as any).toDate ? (b.createdAt as any).toDate().getTime() : new Date(b.createdAt as any).getTime();
        return dateB - dateA;
    }).slice(0, 5); // Tomamos los últimos 5

    return {
      totalRevenue,
      totalOrders: orders.length,
      completedOrders: completed.length,
      pendingRevenue,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      recentOrders: sortedOrders
    };
  }, [orders]);

  if (authLoading || ordersLoading) {
    return (
        <div className="container mx-auto space-y-4">
            <PageHeader title="Analíticas" description="Cargando datos..." />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
        </div>
    );
  }

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Analíticas de Ventas" 
        description="Resumen del rendimiento de tu negocio en tiempo real." 
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              +${stats.pendingRevenue.toFixed(2)} pendientes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Totales</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-muted-foreground">
              {stats.completedOrders} entregados exitosamente
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.avgOrderValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Por pedido completado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Finalización</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {stats.totalOrders > 0 
                    ? `${((stats.completedOrders / stats.totalOrders) * 100).toFixed(0)}%` 
                    : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">Tasa de éxito</p>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Últimos Movimientos</CardTitle>
          <CardDescription>Tus {stats.recentOrders.length} ventas más recientes. (Haz clic para ver el detalle)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {stats.recentOrders.map(order => (
                // ✅ ENLACE AGREGADO: Toda la fila es un enlace al pedido
                <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center hover:bg-muted/50 p-2 rounded-md transition-colors cursor-pointer">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="ml-4 space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none truncate">{order.customerName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="font-medium text-green-600">+${order.total.toFixed(2)}</div>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{order.status}</Badge>
                    </div>
                </Link>
            ))}
            {stats.recentOrders.length === 0 && (
                <p className="text-center text-muted-foreground py-4">No hay movimientos recientes.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}