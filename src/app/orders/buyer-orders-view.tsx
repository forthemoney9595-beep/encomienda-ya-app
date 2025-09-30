'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, PackageSearch } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order } from '@/lib/order-service';
import { getOrdersByUser } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from '@/components/ui/skeleton';

const getBadgeVariant = (status: string) => {
  switch (status) {
    case 'Entregado':
      return 'secondary';
    case 'En reparto':
      return 'default';
    case 'En preparación':
    case 'Pedido Realizado':
      return 'outline';
    case 'Cancelado':
      return 'destructive';
    default:
      return 'outline';
  }
};

export default function BuyerOrdersView() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    const fetchOrders = async () => {
      setLoading(true);
      const userOrders = await getOrdersByUser(user.uid);
      setOrders(userOrders);
      setLoading(false);
    };

    fetchOrders();
  }, [user, authLoading]);


  if (loading) {
     return (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {orders.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-48">
            <PackageSearch className="h-12 w-12 mb-4" />
            <p className="text-lg">Aún no has realizado ningún pedido.</p>
            <p className="text-sm">¡Explora las tiendas y encuentra algo que te guste!</p>
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => (
          <Link href={`/orders/${order.id}`} key={order.id}>
            <Card className="transition-all hover:bg-muted/50 hover:shadow-md">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0">
                  <div>
                    <CardTitle className="text-lg">{order.storeName}</CardTitle>
                    <CardDescription>Pedido #{order.id.substring(0, 7)}</CardDescription>
                  </div>
                  <Badge variant={getBadgeVariant(order.status)} className="w-fit">{order.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{format(order.createdAt, "d 'de' MMMM, yyyy", { locale: es })}</p>
                  <p className="text-2xl font-bold text-primary">${order.total.toFixed(2)}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
