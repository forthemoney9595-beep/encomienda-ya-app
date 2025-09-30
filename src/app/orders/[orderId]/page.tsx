import { notFound } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getOrderById } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';
import { geocodeAddress } from '@/ai/flows/geocode-address';
import { OrderMap } from './order-map';
import 'leaflet/dist/leaflet.css';

export default async function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const order = await getOrderById(params.orderId);

  if (!order) {
    notFound();
  }
  
  // For prototype orders, geocoding might fail if addresses are too generic.
  // We can provide default coords or handle it gracefully.
  const [storeCoords, customerCoords] = await Promise.all([
    geocodeAddress({ address: order.storeAddress! }),
    geocodeAddress({ address: order.shippingAddress.address })
  ]).catch(err => {
    console.error("Geocoding failed, using fallbacks for prototype", err);
    // Fallback coordinates for prototype mode
    return [
      { lat: 40.7128, lon: -74.0060 },
      { lat: 40.7580, lon: -73.9855 }
    ];
  });
  
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
