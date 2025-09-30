
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order } from '@/lib/order-service';
import { getOrdersByStore } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import { getPrototypeOrders, getPrototypeOrdersByStore } from '@/lib/placeholder-data';

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

export default function StoreOrdersView() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient || authLoading) return;
        if (!user || user.role !== 'store' || !user.storeId) {
            setLoading(false);
            return;
        };

        const fetchOrders = async () => {
            setLoading(true);
            let storeOrders: Order[] = [];
            if (user.uid.startsWith('proto-')) {
                // Correctly fetch from session-aware function and then filter
                storeOrders = getPrototypeOrdersByStore(user.storeId)
                    .map(o => ({...o, createdAt: new Date(o.createdAt)}));
            } else {
                storeOrders = await getOrdersByStore(user.storeId!);
            }
            storeOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            setOrders(storeOrders);
            setLoading(false);
        };

        fetchOrders();
    }, [user, authLoading, isClient]);

    const handleRowClick = (orderId: string) => {
        router.push(`/orders/${orderId}`);
    };

    if (loading || !isClient) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Pedidos Entrantes</CardTitle>
                    <CardDescription>Aquí están los pedidos que tu tienda ha recibido.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Pedidos Entrantes</CardTitle>
          <CardDescription>Aquí están los pedidos que tu tienda ha recibido.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Aún no has recibido ningún pedido.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => handleRowClick(order.id)}>
                    <TableCell className="font-medium">#{order.id.substring(0, 7)}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{format(order.createdAt, "Pp", { locale: es })}</TableCell>
                    <TableCell>
                      <Badge variant={getBadgeVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">${order.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
}
