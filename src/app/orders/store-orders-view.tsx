
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order, OrderStatus } from '@/lib/order-service';
import { useAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { collection, query, where, orderBy, CollectionReference } from 'firebase/firestore';

const getBadgeVariant = (status: OrderStatus) => {
    switch (status) {
      case 'Entregado':
        return 'secondary';
      case 'En reparto':
        return 'default';
      case 'Pendiente de Pago':
        return 'outline';
      case 'En preparación':
      case 'Pedido Realizado':
        return 'outline';
      case 'Pendiente de Confirmación':
        return 'default'; // Make it stand out
      case 'Cancelado':
      case 'Rechazado':
        return 'destructive';
      default:
        return 'outline';
    }
  };

export default function StoreOrdersView() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    
    const ordersQuery = useMemoFirebase(() => {
        if (!firestore || !user?.storeId) return null;
        return query(
            collection(firestore, 'orders'),
            where('storeId', '==', user.storeId),
            orderBy('createdAt', 'desc')
        ) as CollectionReference<Order>;
    }, [firestore, user?.storeId]);
    
    const { data: orders, isLoading: ordersLoading } = useCollection<Order>(ordersQuery);

    const isLoading = authLoading || ordersLoading;

    const handleRowClick = (orderId: string) => {
        router.push(`/orders/${orderId}`);
    };

    if (isLoading) {
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
              {!orders || orders.length === 0 ? (
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
                    <TableCell>{format(new Date(order.createdAt), "Pp", { locale: es })}</TableCell>
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

    