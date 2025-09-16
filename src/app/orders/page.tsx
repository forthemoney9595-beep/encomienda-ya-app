import Link from 'next/link';
import { orders } from '@/lib/placeholder-data';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

export default function OrdersPage() {
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'Delivered':
        return 'default';
      case 'Out for Delivery':
        return 'secondary';
      case 'Preparing':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto">
      <PageHeader title="My Orders" description="View your recent and ongoing orders." />
      <div className="space-y-4">
        {orders.map((order) => (
          <Link href={`/orders/${order.id}`} key={order.id}>
            <Card className="transition-all hover:bg-muted/50 hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg">{order.storeName}</CardTitle>
                  <CardDescription>Order #{order.id} - {order.date}</CardDescription>
                </div>
                <Badge variant={getBadgeVariant(order.status)}>{order.status}</Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-2xl font-bold text-primary">${order.total.toFixed(2)}</p>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
