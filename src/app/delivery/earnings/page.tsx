'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, CollectionReference } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Truck, Clock, BarChart3 } from 'lucide-react';
import { format } from 'date-fns'; 
import { es } from 'date-fns/locale'; 

export default function DeliveryEarningsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  // 1. Seguridad: Redirigir si no es repartidor
  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // 2. Traer TODAS las órdenes entregadas por este repartidor
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', user.uid),
      where('status', '==', 'Entregado')
    ) as CollectionReference<Order>;
  }, [firestore, user?.uid]);

  const { data: deliveredOrders, isLoading: ordersLoading } = useCollection<Order>(ordersQuery);

  // 3. Cálculos de Ganancias
  const stats = useMemo(() => {
    if (!deliveredOrders) return { totalEarnings: 0, totalDeliveries: 0, avgFee: 0, maxFee: 0 };

    const totalEarnings = deliveredOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
    
    return {
      totalEarnings,
      totalDeliveries: deliveredOrders.length,
      avgFee: deliveredOrders.length > 0 ? totalEarnings / deliveredOrders.length : 0,
      maxFee: deliveredOrders.reduce((max, order) => Math.max(max, order.deliveryFee || 0), 0)
    };
  }, [deliveredOrders]);

  if (authLoading || ordersLoading) {
    return (
        <div className="container mx-auto space-y-4">
            <PageHeader title="Mis Estadísticas" description="Cargando datos de ganancias..." />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
        </div>
    );
  }

  const earningsData = deliveredOrders || [];

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Historial de Ganancias" 
        description={`Resumen de tus entregas completadas, ${userProfile?.displayName || 'Repartidor'}.`} 
      />

      {/* Tarjetas de Estadísticas Principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia Total</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${stats.totalEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Total acumulado de todas tus entregas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas Completadas</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDeliveries}</div>
            <p className="text-xs text-muted-foreground">
              Pedidos entregados exitosamente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tarifa Promedio</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.avgFee.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Ganancia promedio por entrega
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Máxima Tarifa</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.maxFee.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Tu mayor ganancia en un solo viaje
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Historial de Entregas */}
      <Card>
        <CardHeader>
          <CardTitle>Entregas Recientes</CardTitle>
          <CardDescription>Detalle de tus últimas {earningsData.length} entregas completadas.</CardDescription>
        </CardHeader>
        <CardContent>
            {earningsData.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                    <Clock className="mx-auto h-8 w-8 mb-2" />
                    <p>Aún no has completado ninguna entrega.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {earningsData.map((order) => (
                        <Card key={order.id} className="p-3 flex justify-between items-center bg-muted/20">
                            <div>
                                <p className="font-semibold text-sm">Pedido #{order.id.substring(0, 7)}</p>
                                <p className="text-xs text-muted-foreground">De {order.storeName}</p>
                            </div>
                            <div className="flex flex-col items-end">
                                <p className="font-bold text-lg text-green-600">
                                    +${order.deliveryFee.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {order.createdAt && typeof (order.createdAt as any).toDate === 'function' ? format((order.createdAt as any).toDate(), 'PPP', { locale: es }) : 'Fecha desconocida'}
                                </p>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}