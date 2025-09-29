import { notFound } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PackageCheck, CookingPot, Bike, Home, XCircle, FileClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOrderById } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';

export default async function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const order = await getOrderById(params.orderId);

  if (!order) {
    notFound();
  }
  
  const allStatuses = [
    { name: 'Pedido Realizado', icon: PackageCheck, completed: false },
    { name: 'En preparación', icon: CookingPot, completed: false },
    { name: 'En reparto', icon: Bike, completed: false },
    { name: 'Entregado', icon: Home, completed: false },
  ];

  if (order.status === 'Cancelado') {
      // If cancelled, only show that status as completed.
      allStatuses.forEach(s => s.completed = false);
      allStatuses.unshift({ name: 'Cancelado', icon: XCircle, completed: true });
  } else {
      let completed = true;
      for (const status of allStatuses) {
          if (completed) {
              status.completed = true;
          }
          if (status.name === order.status) {
              completed = false; // All subsequent statuses are not completed
          }
      }
  }


  return (
    <div className="container mx-auto">
      <PageHeader 
        title={`Pedido #${order.id.substring(0, 7)}`} 
        description={`Realizado el ${format(order.createdAt, "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}`} 
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                <CardTitle>Seguimiento del Pedido</CardTitle>
                <CardDescription>Tu pedido de <span className="font-semibold text-primary">{order.storeName}</span> está actualmente: <span className="font-bold text-primary">{order.status}</span></CardDescription>
                </CardHeader>
                <CardContent>
                <div className="relative pl-8">
                    {/* Vertical line */}
                    <div className="absolute left-[1.1875rem] top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                    
                    <ul className="space-y-8">
                    {allStatuses.map((status, index) => (
                        <li key={index} className="flex items-center">
                        <div className={cn(
                            "z-10 flex h-10 w-10 items-center justify-center rounded-full",
                            status.completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            order.status === 'Cancelado' && status.name === 'Cancelado' && 'bg-destructive text-destructive-foreground'
                        )}>
                            <status.icon className="h-5 w-5" />
                        </div>
                        <div className="ml-6">
                            <h3 className={cn(
                            "font-semibold",
                            status.completed ? 'text-foreground' : 'text-muted-foreground'
                            )}>
                            {status.name}
                            </h3>
                        </div>
                        </li>
                    ))}
                    </ul>
                </div>
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
                </CardContent>
            </Card>
            <OrderStatusUpdater order={order} />
        </div>
      </div>
    </div>
  );
}

