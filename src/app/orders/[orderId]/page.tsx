
'use client';

import { notFound, useParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getOrderById, Order } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';
import { geocodeAddress } from '@/ai/flows/geocode-address';
import { OrderMap } from './order-map';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

function OrderPageSkeleton() {
    return (
        <div className="container mx-auto">
            <PageHeader
                title={<Skeleton className="h-9 w-48" />}
                description={<Skeleton className="h-5 w-64" />}
            />
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                    <Card className='h-[600px] flex flex-col'>
                        <CardHeader>
                            <Skeleton className="h-8 w-1/3 mb-2" />
                            <Skeleton className="h-5 w-2/3" />
                        </CardHeader>
                        <CardContent className='flex-grow'>
                            <Skeleton className="h-full w-full rounded-md" />
                        </CardContent>
                    </Card>
                </div>
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
             </div>
        </div>
    )
}


export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [storeCoords, setStoreCoords] = useState<{lat: number, lon: number} | null>(null);
  const [customerCoords, setCustomerCoords] = useState<{lat: number, lon: number} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrderData = async () => {
      setLoading(true);
      const orderData = await getOrderById(orderId);
      
      if (!orderData) {
        notFound();
      }
      setOrder(orderData);
      
      try {
        const [sCoords, cCoords] = await Promise.all([
          geocodeAddress({ address: orderData.storeAddress! }),
          geocodeAddress({ address: orderData.shippingAddress.address })
        ]);
        setStoreCoords(sCoords);
        setCustomerCoords(cCoords);
      } catch (err) {
        console.error("Geocoding failed, using fallbacks for prototype", err);
        setStoreCoords({ lat: 40.7128, lon: -74.0060 });
        setCustomerCoords({ lat: 40.7580, lon: -73.9855 });
      }

      setLoading(false);
    };

    fetchOrderData();
  }, [orderId]);


  if (loading || !order || !storeCoords || !customerCoords) {
    return <OrderPageSkeleton />;
  }
  
  return (
    <div className="container mx-auto">
      <PageHeader 
        title={`Pedido #${order.id.substring(0, 7)}`} 
        description={`Realizado el ${format(order.createdAt, "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}`} 
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
            <Card className='h-[600px] flex flex-col'>
                <CardHeader>
                  <CardTitle>Seguimiento del Pedido</CardTitle>
                  <CardDescription>Tu pedido de <span className="font-semibold text-primary">{order.storeName}</span> está actualmente: <span className="font-bold text-primary">{order.status}</span></CardDescription>
                </CardHeader>
                <CardContent className='flex-grow'>
                 <OrderMap 
                    orderStatus={order.status}
                    storeCoords={storeCoords}
                    customerCoords={customerCoords}
                 />
                </CardContent>
            </Card>
        </div>
         <div className="md:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Resumen del Pedido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
      </div>
    </div>
  );
}
