'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
// ✅ Usamos la librería centralizada
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Package, Clock, Truck, CheckCircle2, ChevronRight, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { OrderStatus } from '@/lib/order-service';

export default function BuyerOrdersView() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  // ✅ QUERY PROFESIONAL: Usamos 'orderBy'
  // NOTA: Si esto falla o no muestra nada, abre la consola del navegador (F12).
  // Verás un link de Firebase para "Crear Índice Compuesto". Haz clic ahí.
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc') // Esto requiere el índice
    );
  }, [firestore, user?.uid]);

  // Usamos el hook de tiempo real. Si cambia el estado, se actualiza solo.
  const { data: orders, isLoading } = useCollection<any>(ordersQuery);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando tus pedidos...</div>;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Entregado': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'En reparto':
      case 'En camino': return <Truck className="h-5 w-5 text-blue-500" />;
      case 'Cancelado': 
      case 'Rechazado': return <Package className="h-5 w-5 text-red-500" />;
      default: return <Clock className="h-5 w-5 text-orange-500" />;
    }
  };

  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'Entregado': return 'secondary';
      case 'En reparto': return 'default';
      case 'Cancelado':
      case 'Rechazado': return 'destructive';
      default: return 'outline';
    }
  };
  
  const formatDate = (date: any) => {
    if (!date) return 'Fecha desconocida';
    try {
        // Manejo robusto de fechas (Timestamp o Date)
        let dateObj: Date;
        if (typeof date === 'object' && typeof date.toDate === 'function') {
             dateObj = date.toDate();
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            return '';
        }
        return format(dateObj, "d MMM, HH:mm", { locale: es });
    } catch (error) {
        return '';
    }
  };

  return (
    <div className="container mx-auto pb-20 px-4">
      <PageHeader title="Mis Pedidos" description="Sigue el estado de tus compras en tiempo real." />
      
      <div className="space-y-4">
        {!orders || orders.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20">
                <Package className="mx-auto h-12 w-12 text-muted-foreground mb-3 opacity-50" />
                <h3 className="text-lg font-medium text-muted-foreground">No tienes pedidos activos</h3>
                <Button variant="link" onClick={() => router.push('/')}>Ir a comprar</Button>
            </div>
        ) : (
            orders.map(order => {
                const displayTotal = order.total || 0;
                
                return (
                    <Card 
                        key={order.id} 
                        className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-primary group"
                        onClick={() => router.push(`/orders/${order.id}`)}
                    >
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-2 bg-muted rounded-full group-hover:bg-primary/10 transition-colors">
                                    {getStatusIcon(order.status)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-base">{order.storeName}</h4>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(order.createdAt)}
                                    </p>
                                    <div className="mt-2 flex gap-2">
                                        <Badge variant={getBadgeVariant(order.status)} className="text-[10px]">
                                            {order.status}
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                                            <DollarSign className="h-3 w-3" />
                                            {order.paymentMethod}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg">${displayTotal.toLocaleString()}</p>
                                <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto mt-2 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </Card>
                );
            })
        )}
      </div>
    </div>
  );
}