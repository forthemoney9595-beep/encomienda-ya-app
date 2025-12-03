'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Truck, CreditCard } from 'lucide-react';
import { format } from 'date-fns'; 
import { es } from 'date-fns/locale'; 

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

  // 1. Seguridad: Redirigir si no es repartidor
  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // 2. Traer TODAS las órdenes entregadas por este repartidor
  const earningsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', user.uid),
      where('status', '==', 'Entregado'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user?.uid]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(earningsQuery);

  if (authLoading || ordersLoading) {
    return (
        <div className="container mx-auto space-y-4 pb-20">
            <PageHeader title="Mis Finanzas" description="Calculando balance..." />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
        </div>
    );
  }

  // 3. Cálculos Financieros
  const deliveredOrders = orders || [];

  // Ganancia Total (Tu dinero real por el servicio)
  // Sumamos solo el deliveryFee
  const totalEarnings = deliveredOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);

  return (
    <div className="container mx-auto pb-20">
      <PageHeader 
        title="Mis Finanzas" 
        description={`Balance de ganancias para ${userProfile?.displayName || 'Repartidor'}.`} 
      />

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        
        {/* TARJETA 1: GANANCIAS NETAS (TU DINERO) */}
        <Card className="border-l-4 border-l-green-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Ganancias Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">${totalEarnings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
                Acumulado por tus {deliveredOrders.length} entregas.
            </p>
          </CardContent>
        </Card>

      </div>

      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Truck className="h-5 w-5"/> Historial de Entregas
      </h3>

      <div className="space-y-4">
        {deliveredOrders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                <Truck className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>Aún no has completado ninguna entrega.</p>
            </div>
        ) : (
            deliveredOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-bold">{order.storeName}</span>
                            <Badge variant="outline" className="text-[10px] font-normal">
                                {formatDate(order.createdAt)}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CreditCard className="h-3 w-3" /> Pago Digital
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="block font-bold text-green-600">+${order.deliveryFee}</span>
                        <span className="text-[10px] text-muted-foreground">Tu ganancia</span>
                    </div>
                </div>
            ))
        )}
      </div>
    </div>
  );
}