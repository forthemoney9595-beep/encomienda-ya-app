

'use client';

import { useParams, useRouter, notFound } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type Order, getOrderById as getOrderFromDb, OrderStatus } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';
import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, CookingPot, Bike, Home, Package, Clock, Wallet, Ban, Star, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDescription as AlertDescriptionComponent } from '@/components/ui/alert-dialog';
import type { CartItem } from '@/context/cart-context';
import { useCart } from '@/context/cart-context';
import { LeaveReviewDialog } from './leave-review-dialog';
import { Button } from '@/components/ui/button';
import { DeliveryReviewCard } from './delivery-review-card';


function OrderPageSkeleton() {
    return (
        <div className="container mx-auto">
            <PageHeader
                title={<Skeleton className="h-9 w-48" />}
                description={<Skeleton className="h-5 w-64" />}
            />
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
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
                 <div className="md:col-span-1">
                     <Card>
                        <CardHeader>
                            <CardTitle>Mapa de Entrega</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64">
                            <Skeleton className="h-full w-full" />
                        </CardContent>
                    </Card>
                </div>
             </div>
        </div>
    )
}

const statusSteps: Record<OrderStatus, { step: number; label: string; icon: React.ElementType; description: string; }> = {
  'Pendiente de Confirmación': { step: 0, label: 'Pendiente', icon: Clock, description: 'Esperando que la tienda confirme tu pedido.' },
  'Pendiente de Pago': { step: 1, label: 'Confirmado', icon: Wallet, description: '¡La tienda confirmó! Realiza el pago para continuar.' },
  'En preparación': { step: 2, label: 'Preparando', icon: CookingPot, description: 'La tienda está preparando tu pedido.' },
  'En reparto': { step: 3, label: 'En Reparto', icon: Bike, description: 'Un repartidor ha recogido tu pedido y está en camino.' },
  'Entregado': { step: 4, label: 'Entregado', icon: Home, description: '¡Tu pedido ha sido entregado! Disfrútalo.' },
  'Cancelado': { step: -1, label: 'Cancelado', icon: Ban, description: 'Este pedido ha sido cancelado.' },
  'Rechazado': { step: -1, label: 'Rechazado', icon: Ban, description: 'La tienda no pudo tomar tu pedido en este momento.' },
  'Pedido Realizado': { step: 2, label: 'Pagado', icon: Package, description: 'Tu pago ha sido recibido.' },
};

function OrderProgress({ status }: { status: Order['status'] }) {
    const currentStatusInfo = statusSteps[status] || { step: 0, label: 'Desconocido' };
    const totalSteps = 4; // 0: Pendiente, 1: Confirmado, 2: Preparando, 3: En reparto, 4: Entregado
    const progressValue = (currentStatusInfo.step / totalSteps) * 100;
    
    if (status === 'Cancelado' || status === 'Rechazado') {
        return (
             <div className="text-center">
                <Ban className="mx-auto h-12 w-12 text-destructive" />
                <h3 className="mt-2 text-lg font-semibold">{status}</h3>
                <p className="text-sm text-muted-foreground">{currentStatusInfo.description}</p>
             </div>
        )
    }

    const steps = Object.values(statusSteps).filter(s => s.step >= 0 && s.step <= totalSteps).sort((a,b) => a.step - b.step);

    return (
        <div className="space-y-8">
            <div>
                <Progress value={progressValue} className="h-2" />
                <div className="mt-4 grid grid-cols-5 gap-2 text-center text-[10px] lg:text-xs">
                    {steps.map((stepInfo) => (
                        <div key={stepInfo.step} className={cn("flex flex-col items-center gap-1.5", currentStatusInfo.step >= stepInfo.step ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                            <stepInfo.icon className="h-5 w-5" />
                            <span>{stepInfo.label}</span>
                        </div>
                    ))}
                </div>
            </div>
             <Alert>
                <currentStatusInfo.icon className="h-4 w-4" />
                <AlertTitle>{currentStatusInfo.label}</AlertTitle>
                <AlertDescriptionComponent>
                    {currentStatusInfo.description}
                     {status === 'En preparación' && (
                        <p className="mt-2 text-base font-bold text-primary">Entrega estimada: 25-40 min</p>
                    )}
                </AlertDescriptionComponent>
            </Alert>
        </div>
    )
}

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { getOrderById: getPrototypeOrderById, loading: prototypeLoading, prototypeOrders, addReviewToProduct, addDeliveryReviewToOrder } = usePrototypeData();
  const { clearCart, addToCart, storeId: cartStoreId } = useCart();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewingItem, setReviewingItem] = useState<CartItem | null>(null);
  const [isReorderAlertOpen, setReorderAlertOpen] = useState(false);


  const OrderMap = useMemo(() => dynamic(() => import('./order-map'), { 
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  }), []);

  useEffect(() => {
    async function fetchOrderData() {
        if (!orderId || authLoading || prototypeLoading) return;
        
        setLoading(true);
        let orderData: Order | null | undefined = null;

        try {
            if (orderId.startsWith('proto-')) {
                orderData = getPrototypeOrderById(orderId);
            } else {
                orderData = await getOrderFromDb(orderId);
            }
          
          if (!orderData) {
            console.warn(`Pedido no encontrado (ID: ${orderId}), redirigiendo a /orders.`);
            toast({
                variant: 'destructive',
                title: 'Pedido no encontrado',
                description: `No se pudo encontrar el pedido con ID: ${orderId}`
            });
            router.push('/orders');
            return;
          }
          
          const isOwner = user?.storeId === orderData.storeId;
          const isBuyer = user?.uid === orderData.userId;
          const isAssignedDriver = user?.uid === orderData.deliveryPersonId;
          const isAdmin = user?.role === 'admin';
          const isAvailableForDelivery = user?.role === 'delivery' && orderData.status === 'En preparación' && !orderData.deliveryPersonId;
    
          if (!isOwner && !isBuyer && !isAssignedDriver && !isAdmin && !isAvailableForDelivery) {
              console.warn("Acceso no autorizado al pedido denegado.");
              toast({
                variant: 'destructive',
                title: 'Acceso Denegado',
                description: 'No tienes permiso para ver este pedido.',
            });
              router.push('/orders'); 
              return;
          }
    
          setOrder(orderData);

        } catch (error) {
            console.error('Error fetching order data:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos del pedido.' });
        } finally {
            setLoading(false);
        }
    }
    
    if (!authLoading && !prototypeLoading) {
        fetchOrderData();
    }

  }, [orderId, user, authLoading, router, getPrototypeOrderById, prototypeLoading, toast, prototypeOrders]);
  
    const handleReviewSubmit = (rating: number, review: string) => {
        if (!reviewingItem || !order) return;
        addReviewToProduct(order.storeId, reviewingItem.id, rating, review);
        
        setOrder(prevOrder => {
            if (!prevOrder) return null;
            const updatedItems = prevOrder.items.map(item => 
                item.id === reviewingItem.id ? { ...item, userRating: rating } : item
            );
            return { ...prevOrder, items: updatedItems };
        });

        toast({
            title: "¡Reseña de producto enviada!",
            description: `Gracias por tu opinión sobre ${reviewingItem.name}.`
        });
        setReviewingItem(null);
    };

    const handleDeliveryReviewSubmit = (rating: number, review: string) => {
        if (!order) return;
        addDeliveryReviewToOrder(order.id, rating, review);
        setOrder(prev => prev ? { ...prev, deliveryRating: rating, deliveryReview: review } : null);
        toast({
            title: "¡Reseña de entrega enviada!",
            description: `Gracias por calificar a ${order.deliveryPersonName}.`
        });
    };

    const executeReorder = () => {
        if (!order) return;
        clearCart();
        order.items.forEach(item => {
            // We need to pass the base product, not the cart item with quantity
            const { quantity, ...product } = item;
            for (let i = 0; i < quantity; i++) {
                addToCart(product, order.storeId);
            }
        });
        toast({
            title: "¡Pedido repetido!",
            description: "Los artículos de este pedido han sido añadidos a tu carrito."
        });
        router.push('/checkout');
    };

    const handleReorderClick = () => {
        if (!order) return;

        if (cartStoreId && cartStoreId !== order.storeId) {
            setReorderAlertOpen(true);
        } else {
            executeReorder();
        }
    }


  if (loading || authLoading || prototypeLoading || !order) {
    return <OrderPageSkeleton />;
  }
  
  const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.deliveryFee;
  const isBuyer = user?.uid === order.userId;

  return (
    <div className="container mx-auto">
      <AlertDialog open={isReorderAlertOpen} onOpenChange={setReorderAlertOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
              <AlertDialogTitle>¿Vaciar carrito actual?</AlertDialogTitle>
              <AlertDialogDescription>
                  Tu carrito contiene productos de otra tienda. Para repetir este pedido, tu carrito actual será vaciado. ¿Deseas continuar?
              </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={executeReorder}>Sí, vaciar y repetir</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <PageHeader 
        title={`Pedido #${order.id.substring(0,7)}...`} 
        description={`Realizado el ${format(order.createdAt, "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}`}
      >
        {isBuyer && order.status === 'Entregado' && (
            <Button onClick={handleReorderClick}>
                <Repeat className="mr-2 h-4 w-4" />
                Volver a Pedir
            </Button>
        )}
      </PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Resumen del Pedido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <CardDescription>
                        Pedido de <span className="font-semibold text-primary">{order.storeName}</span>
                    </CardDescription>
                     <CardDescription>
                       Estado actual: <span className="font-bold text-primary">{order.status}</span>
                    </CardDescription>
                    <Separator/>
                    {order.items.map(item => (
                        <div key={item.id} className="flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{item.name}</p>
                                <p className="text-sm text-muted-foreground">Cantidad: {item.quantity}</p>
                            </div>
                            <div className="text-right flex items-center gap-4">
                               {isBuyer && order.status === 'Entregado' && (
                                   item.userRating ? (
                                        <div className="flex items-center gap-1 text-sm text-amber-500">
                                            <span>Tu nota:</span>
                                            <Star className="h-4 w-4 fill-current" />
                                            <span className="font-bold">{item.userRating}</span>
                                        </div>
                                   ) : (
                                        <Button variant="outline" size="sm" onClick={() => setReviewingItem(item)}>
                                            <Star className="mr-2 h-4 w-4" /> Valorar
                                        </Button>
                                   )
                                )}
                                <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                        </div>
                    ))}
                    <Separator/>
                     <div className="flex justify-between">
                        <p>Subtotal</p>
                        <p>${(total - order.deliveryFee).toFixed(2)}</p>
                    </div>
                     <div className="flex justify-between">
                        <p>Tarifa de envío</p>
                        <p>${order.deliveryFee.toFixed(2)}</p>
                    </div>
                    <Separator/>
                    <div className="flex justify-between font-bold">
                        <p>Total</p>
                        <p>${total.toFixed(2)}</p>
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
             <Card>
                <CardHeader>
                    <CardTitle>Estado del Pedido</CardTitle>
                </CardHeader>
                <CardContent>
                   <OrderProgress status={order.status} />
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-1 space-y-8">
             <Card>
                <CardHeader>
                    <CardTitle>Mapa de Entrega</CardTitle>
                </CardHeader>
                <CardContent className="h-96">
                   {order.storeCoords && order.customerCoords ? (
                       <OrderMap order={order} />
                   ) : <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">No hay datos de ubicación para este pedido.</div>}
                </CardContent>
                <CardFooter>
                    <p className="text-xs text-muted-foreground">
                        {order.status === 'En reparto' 
                            ? "La línea representa la ruta de entrega directa desde la tienda hasta tu ubicación."
                            : "Los iconos marcan la ubicación de la tienda y la dirección de entrega."
                        }
                    </p>
                </CardFooter>
            </Card>

            {isBuyer && order.status === 'Entregado' && order.deliveryPersonName && (
                order.deliveryRating ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Tu Valoración de la Entrega</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                             <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star key={star} className={cn('h-5 w-5', order.deliveryRating && order.deliveryRating >= star ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30')} />
                                ))}
                                <span className="ml-2 font-bold text-lg">{order.deliveryRating}/5</span>
                            </div>
                            {order.deliveryReview && (
                                <blockquote className="border-l-2 pl-4 italic text-muted-foreground">
                                    "{order.deliveryReview}"
                                </blockquote>
                            )}
                             <p className="text-xs text-muted-foreground pt-2">Valoración para {order.deliveryPersonName}.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <DeliveryReviewCard order={order} onSubmit={handleDeliveryReviewSubmit} />
                )
            )}
        </div>
      </div>
       {reviewingItem && (
        <LeaveReviewDialog
          isOpen={!!reviewingItem}
          setIsOpen={(isOpen) => !isOpen && setReviewingItem(null)}
          productName={reviewingItem.name}
          onSubmit={handleReviewSubmit}
        />
      )}
    </div>
  );
}

    