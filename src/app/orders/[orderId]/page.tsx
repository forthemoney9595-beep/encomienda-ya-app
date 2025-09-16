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
    { name: 'Order Placed', icon: PackageCheck, completed: true },
    { name: 'Preparing', icon: CookingPot, completed: order.status === 'Preparing' || order.status === 'Out for Delivery' || order.status === 'Delivered' },
    { name: 'Out for Delivery', icon: Bike, completed: order.status === 'Out for Delivery' || order.status === 'Delivered' },
    { name: 'Delivered', icon: Home, completed: order.status === 'Delivered' },
  ];

  return (
    <div className="container mx-auto">
      <PageHeader title={`Order #${order.id}`} description={`Tracking your order from ${order.storeName}`} />
      <Card>
        <CardHeader>
          <CardTitle>Order Status</CardTitle>
          <CardDescription>Your order is currently: <span className="font-bold text-primary">{order.status}</span></CardDescription>
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
