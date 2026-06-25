'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
// ✅ AGREGADO: Importamos 'ChefHat' para darle un ícono bonito al estado "En preparación"
import { Package, Clock, Truck, CheckCircle2, ChevronRight, DollarSign, ChefHat, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getOrderStatusKind, orderStatusBadgeClass, orderStatusTextClass } from '@/lib/order-status';

export default function BuyerOrdersView() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user?.uid]);

  // useCollection ya escucha cambios en tiempo real (onSnapshot)
  const { data: orders, isLoading } = useCollection<any>(ordersQuery);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando tus pedidos...</div>;

  // 🎨 Ícono por estado, coloreado con el sistema semántico compartido.
  const getStatusIcon = (status: string) => {
    const s = status?.toLowerCase() || '';
    const color = orderStatusTextClass[getOrderStatusKind(status)];

    if (s.includes('entregado')) return <CheckCircle2 className={cn('h-5 w-5', color)} />;
    if (s.includes('reparto') || s.includes('camino')) return <Truck className={cn('h-5 w-5', color)} />;
    if (s.includes('preparación') || s.includes('cocina') || s.includes('listo')) return <ChefHat className={cn('h-5 w-5', color)} />;
    if (s.includes('cancelado') || s.includes('rechazado')) return <AlertCircle className={cn('h-5 w-5', color)} />;
    return <Clock className={cn('h-5 w-5', color)} />;
  };

  const formatDate = (date: any) => {
    if (!date) return 'Fecha desconocida';
    try {
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
    <div className="container mx-auto">
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
                // Detectamos si fue pagado por MP
                const isPaid = order.paymentStatus === 'paid'; 
                
                return (
                    <Card
                        key={order.id}
                        className={`cursor-pointer hover:shadow-md transition-all border-l-4 group ${isPaid ? 'border-l-success' : 'border-l-border'}`}
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
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {/* Badge de Estado del Pedido */}
                                        <Badge variant="outline" className={cn('text-[10px]', orderStatusBadgeClass[getOrderStatusKind(order.status)])}>
                                            {order.status}
                                        </Badge>

                                        {/* Badge de Método de Pago */}
                                        <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${isPaid ? 'bg-success/15 text-success border-success/30' : ''}`}>
                                            {order.paymentMethod === 'mercadopago' ? 'MercadoPago' : order.paymentMethod}
                                            {isPaid && <CheckCircle2 className="h-3 w-3 ml-1" />}
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