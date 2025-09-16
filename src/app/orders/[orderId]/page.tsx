import { notFound } from 'next/navigation';
import { getOrderById } from '@/lib/placeholder-data';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PackageCheck, CookingPot, Bike, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const order = getOrderById(params.orderId);

  if (!order) {
    notFound();
  }
  
  const statuses = [
    { name: 'Pedido Realizado', icon: PackageCheck, completed: true },
    { name: 'En preparación', icon: CookingPot, completed: order.status === 'En preparación' || order.status === 'En reparto' || order.status === 'Entregado' },
    { name: 'En reparto', icon: Bike, completed: order.status === 'En reparto' || order.status === 'Entregado' },
    { name: 'Entregado', icon: Home, completed: order.status === 'Entregado' },
  ];

  return (
    <div className="container mx-auto">
      <PageHeader title={`Pedido #${order.id}`} description={`Siguiendo tu pedido de ${order.storeName}`} />
      <Card>
        <CardHeader>
          <CardTitle>Estado del Pedido</CardTitle>
          <CardDescription>Tu pedido está actualmente: <span className="font-bold text-primary">{order.status}</span></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative pl-8">
            {/* Vertical line */}
            <div className="absolute left-12 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
            
            <ul className="space-y-8">
              {statuses.map((status, index) => (
                <li key={index} className="flex items-center">
                  <div className={cn(
                    "z-10 flex h-10 w-10 items-center justify-center rounded-full",
                    status.completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
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
  );
}
