
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Store, PackageSearch, Loader2, CheckCircle } from 'lucide-react';
import type { Order } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { assignOrderToDeliveryPerson, updateOrderStatus, getAvailableOrdersForDelivery, getOrdersByDeliveryPerson } from '@/lib/order-service';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function DeliveryOrdersView() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchOrders = async () => {
      if (!user) return;
      setLoading(true);
      const isPrototype = user.uid.startsWith('proto-');
      const [available, assigned] = await Promise.all([
          getAvailableOrdersForDelivery(isPrototype),
          getOrdersByDeliveryPerson(user.uid),
      ]);
      setAvailableOrders(available);
      setAssignedOrders(assigned);
      setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !isClient) return;
    if (!user || user.role !== 'delivery') {
      setLoading(false);
      return;
    }
    
    fetchOrders();

    // Refetch on window focus to catch updates made in other tabs/windows for prototype
    const handleFocus = () => {
      if (user.uid.startsWith('proto-')) {
        fetchOrders();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);

  }, [user, authLoading, isClient]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes iniciar sesión para aceptar un pedido.',
      });
      return;
    }

    setLoadingOrderId(orderId);
    try {
      await assignOrderToDeliveryPerson(orderId, user.uid, user.name);
      toast({
        title: '¡Pedido Aceptado!',
        description: 'El pedido ha sido asignado a ti. ¡Hora de ponerse en marcha!',
      });
      // Refetch orders to update both tabs
      await fetchOrders(); 
    } catch (error) {
      console.error('Error accepting order:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo aceptar el pedido. Puede que ya haya sido tomado por otro repartidor.',
      });
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, 'Entregado');
      toast({
        title: '¡Entrega Completada!',
        description: '¡Buen trabajo! El pedido ha sido marcado como entregado.',
      });
      await fetchOrders();
    } catch (error) {
      console.error('Error completing order:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo completar la entrega.',
      });
    } finally {
      setLoadingOrderId(null);
    }
  };
  
  const NoOrdersView = ({ title, description }: { title: string; description: string; }) => (
    <Card>
      <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-48">
        <PackageSearch className="h-12 w-12 mb-4" />
        <p className="text-lg">{title}</p>
        <p className="text-sm">{description}</p>
      </CardContent>
    </Card>
  );

  const OrderCardSkeleton = () => (
    <Card>
        <CardHeader>
            <Skeleton className="h-6 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
            </div>
            <div className="flex justify-end gap-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-32" />
            </div>
        </CardContent>
    </Card>
  );

  if (loading || !isClient) {
    return (
        <div className="space-y-4">
            <OrderCardSkeleton />
            <OrderCardSkeleton />
        </div>
    );
  }

  return (
    <Tabs defaultValue="available" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="available">
          Disponibles
          <Badge className="ml-2">{availableOrders.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="assigned">
          Mis Entregas
          <Badge variant="secondary" className="ml-2">{assignedOrders.length}</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="available" className="mt-4">
        <div className="space-y-4">
          {availableOrders.length === 0 ? (
            <NoOrdersView title="No hay pedidos disponibles" description="Vuelve a consultar pronto." />
          ) : (
            availableOrders.map((order) => (
              <Card key={order.id} className="transition-all hover:bg-muted/50">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> {order.storeName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                            <div>
                                <span className="font-semibold">Recoger en:</span>
                                <p className="text-muted-foreground">{order.storeAddress}</p>
                            </div>
                        </div>
                         <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                            <div>
                                <span className="font-semibold">Entregar a:</span>
                                 <p className="text-muted-foreground">{order.shippingAddress.name}, {order.shippingAddress.address}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/orders/${order.id}`}>Ver Detalles</Link>
                        </Button>
                        <Button onClick={() => handleAcceptOrder(order.id)} disabled={loadingOrderId === order.id}>
                            {loadingOrderId === order.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Aceptar Pedido
                        </Button>
                    </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </TabsContent>
      <TabsContent value="assigned" className="mt-4">
         <div className="space-y-4">
          {assignedOrders.length === 0 ? (
            <NoOrdersView title="No tienes entregas activas" description="Acepta un pedido de la pestaña 'Disponibles'." />
          ) : (
            assignedOrders.map((order) => (
              <Card key={order.id} className="border-primary/50">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> {order.storeName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                            <div>
                                <span className="font-semibold">Recoger en:</span>
                                <p className="text-muted-foreground">{order.storeAddress}</p>
                            </div>
                        </div>
                         <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                            <div>
                                <span className="font-semibold">Entregar a:</span>
                                 <p className="text-muted-foreground">{order.shippingAddress.name}, {order.shippingAddress.address}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/orders/${order.id}`}>Ver Detalles</Link>
                        </Button>
                        <Button onClick={() => handleCompleteOrder(order.id)} disabled={loadingOrderId === order.id} variant="secondary">
                            {loadingOrderId === order.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Marcar como Entregado
                        </Button>
                    </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
