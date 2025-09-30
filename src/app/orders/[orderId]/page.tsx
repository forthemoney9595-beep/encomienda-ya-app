'use client';

import { useParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type Order } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { OrderMap } from './order-map';

function OrderPageSkeleton() {
    return (
        <div className="container mx-auto">
            <PageHeader
                title={<Skeleton className="h-9 w-48" />}
                description={<Skeleton className="h-5 w-64" />}
            />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-1">
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-8 w-1/2" />
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                            </div>
                            <Skeleton className="h-px w-full" />
                             <div className="space-y-2">
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                             <Skeleton className="h-px w-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-1/3" />
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
                 <div className="md:col-span-1">
                     <Card className='min-h-[400px] flex items-center justify-center bg-muted/50'>
                        <CardContent className='text-center text-muted-foreground'>
                             <p>(Área de mapa deshabilitada)</p>
                        </CardContent>
                    </Card>
                </div>
             </div>
        </div>
    )
}


export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { getOrderById, loading: prototypeLoading } = usePrototypeData();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || prototypeLoading) return; // Wait for auth and data to be ready
    if (!orderId || !user) return;

    const orderData = getOrderById(orderId);
      
      if (!orderData) {
        console.warn(`Pedido no encontrado (ID: ${orderId}), redirigiendo a /orders.`);
        router.push('/orders');
        return;
      }
      
      // Security check: ensure user has access to this order
      const isOwner = user?.storeId === orderData.storeId;
      const isBuyer = user?.uid === orderData.userId;
      const isDriver = user?.uid === orderData.deliveryPersonId;
      const isAdmin = user?.role === 'admin';

      if (!isOwner && !isBuyer && !isDriver && !isAdmin) {
          console.warn("Acceso no autorizado al pedido denegado.");
          router.push('/orders'); // Redirect to their own orders page
          return;
      }

      setOrder(orderData);
      setLoading(false);

  }, [orderId, user, authLoading, router, getOrderById, prototypeLoading]);


  if (loading || authLoading || !order) {
    return <OrderPageSkeleton />;
  }
  
  return (
    <div className="container mx-auto">
      <PageHeader 
        title={`Pedido #${order.id.substring(0, 7)}`} 
        description={`Realizado el ${format(order.createdAt, "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}`} 
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="md:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Resumen del Pedido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <CardDescription>
                        Pedido de <span className="font-semibold text-primary">{order.storeName}</span>
                    </CardDescription>
                     <CardDescription>
                       Estado actual: <span className="font-bold text-primary">{order.status}</span>
                    </CardDescription>
                    <Separator/>
                    {order.items.map(item => (
                        <div key={item.id} className="flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{item.name}</p>
                                <p className="text-sm text-muted-foreground">Cantidad: {item.quantity}</p>
                            </div>
                            <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                    ))}
                    <Separator/>
                     <div className="flex justify-between">
                        <p>Subtotal</p>
                        <p>${(order.total - order.deliveryFee).toFixed(2)}</p>
                    </div>
                     <div className="flex justify-between">
                        <p>Tarifa de envío</p>
                        <p>${order.deliveryFee.toFixed(2)}</p>
                    </div>
                    <Separator/>
                    <div className="flex justify-between font-bold">
                        <p>Total</p>
                        <p>${(order.total).toFixed(2)}</p>
                    </div>
                     <Separator/>
                     <div>
                        <h3 className="font-semibold">Dirección de Envío</h3>
                        <p className="text-sm text-muted-foreground">{order.shippingAddress.name}</p>
                        <p className="text-sm text-muted-foreground">{order.shippingAddress.address}</p>
                    </div>
                     {order.deliveryPersonName && (
                        <div>
                            <h3 className="font-semibold">Repartidor</h3>
                            <p className="text-sm text-muted-foreground">{order.deliveryPersonName}</p>
                        </div>
                     )}
                </CardContent>
                 <OrderStatusUpdater order={order} />
            </Card>
        </div>
        <div className="md:col-span-1">
             <Card className='min-h-[400px]'>
                {order.storeCoords && order.customerCoords ? (
                    <OrderMap 
                        orderStatus={order.status}
                        storeCoords={order.storeCoords}
                        customerCoords={order.customerCoords}
                    />
                ) : (
                    <CardContent className='flex h-full items-center justify-center text-center text-muted-foreground'>
                         <p>Las coordenadas para este pedido no están disponibles.</p>
                    </CardContent>
                )}
            </Card>
        </div>
      </div>
    </div>
  );
}
