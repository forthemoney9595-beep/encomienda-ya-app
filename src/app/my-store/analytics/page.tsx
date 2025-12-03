'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { ShoppingBag, User, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

// Helper para formatear fecha de forma segura
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

  const analyticsQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', userProfile.storeId),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, userProfile?.storeId]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(analyticsQuery);

  const stats = useMemo(() => {
    if (!orders) return { totalRevenue: 0, totalOrders: 0, completedOrders: 0, rejectedCount: 0, recentOrders: [] };

    // Filtros
    const completed = orders.filter(o => o.status === 'Entregado');
    const rejected = orders.filter(o => o.status === 'Rechazado' || o.status === 'Cancelado');

    // Cálculos Financieros (Solo de pedidos COMPLETADOS)
    const totalRevenue = completed.reduce((sum, order) => sum + (order.subtotal || 0), 0);
    
    return {
      totalRevenue,
      totalOrders: orders.length,
      completedOrders: completed.length,
      rejectedCount: rejected.length,
      recentOrders: orders.slice(0, 5) // Ya vienen ordenados por la query
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
    <div className="container mx-auto pb-20">
      <PageHeader 
        title="Analíticas de Ventas" 
        description="Resumen financiero y operativo de tu tienda." 
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        
        {/* TOTAL VENTAS */}
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.completedOrders} pedidos completados
            </p>
          </CardContent>
        </Card>

        {/* RECHAZADOS */}
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelados/Rech.</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejectedCount}</div>
            <p className="text-xs text-muted-foreground">
              Oportunidades perdidas
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Últimos Movimientos</CardTitle>
          <CardDescription>Tus {stats.recentOrders.length} pedidos más recientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {stats.recentOrders.map(order => (
                <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center hover:bg-muted/50 p-2 rounded-md transition-colors cursor-pointer">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="ml-4 space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none truncate">{order.customerName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="font-medium text-green-600">+${order.total.toLocaleString()}</div>
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