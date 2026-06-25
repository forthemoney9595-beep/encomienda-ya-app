'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
// ✅ Importamos useDoc para buscar la tienda real
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/lib/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { ShoppingBag, User, XCircle, TrendingUp, Package } from 'lucide-react';
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

  // 1. Seguridad
  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // 2. BUSCAR LA TIENDA DE ESTE USUARIO (CORRECCIÓN CRÍTICA)
  // Igual que en la Billetera, buscamos por ownerId
  const storeQuery = useMemoFirebase(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: userStores, isLoading: storeLoading } = useCollection<any>(storeQuery);
  const myStore = userStores && userStores.length > 0 ? userStores[0] : null;
  const storeId = myStore?.id;

  // 3. Traer Órdenes
  const analyticsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, storeId]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(analyticsQuery);

  // 4. Estadísticas Avanzadas
  const stats = useMemo(() => {
    if (!orders) return { totalRevenue: 0, totalOrders: 0, completedOrders: 0, rejectedCount: 0, recentOrders: [], avgTicket: 0 };

    // Filtros
    const completed = orders.filter(o => o.status === 'Entregado');
    const rejected = orders.filter(o => o.status === 'Rechazado' || o.status === 'Cancelado');

    // Cálculos Financieros (Solo de pedidos COMPLETADOS)
    // Ingreso Bruto (Ventas Totales)
    const totalRevenue = completed.reduce((sum, order) => sum + (order.total || 0), 0);
    
    // Ticket Promedio
    const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;
    
    return {
      totalRevenue,
      totalOrders: orders.length,
      completedOrders: completed.length,
      rejectedCount: rejected.length,
      avgTicket,
      recentOrders: orders.slice(0, 5) 
    };
  }, [orders]);

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        
        {/* TOTAL VENTAS (BRUTO) */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Totales</CardTitle>
            <ShoppingBag className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Ingresos brutos históricos</p>
          </CardContent>
        </Card>

        {/* PEDIDOS COMPLETADOS */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregados</CardTitle>
            <Package className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedOrders}</div>
            <p className="text-xs text-muted-foreground">De {stats.totalOrders} totales</p>
          </CardContent>
        </Card>

        {/* TICKET PROMEDIO */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.avgTicket.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Valor medio por venta</p>
          </CardContent>
        </Card>

        {/* RECHAZADOS */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelados</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.rejectedCount}</div>
            <p className="text-xs text-muted-foreground">Pedidos no concretados</p>
          </CardContent>
        </Card>
      </div>

      {/* LISTA DE MOVIMIENTOS RECIENTES */}
      <Card className="col-span-4 shadow-md">
        <CardHeader>
          <CardTitle>Últimos Movimientos</CardTitle>
          <CardDescription>Tus {stats.recentOrders.length} pedidos más recientes en tiempo real.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recentOrders.map(order => (
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
                        <Badge variant="outline" className={`text-[10px] uppercase ${
                            order.status === 'Entregado' ? 'bg-success/15 text-success border-success/30' :
                            order.status === 'Rechazado' ? 'bg-destructive/15 text-destructive border-destructive/30' :
                            'bg-muted text-muted-foreground'
                        }`}>
                            {order.status}
                        </Badge>
                    </div>
                </Link>
            ))}
            {stats.recentOrders.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>No hay movimientos recientes.</p>
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}