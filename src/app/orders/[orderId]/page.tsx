'use client';

import { useParams, useRouter, notFound, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type Order, OrderService, updateOrderStatus } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';
import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'; 
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { CircularProgress } from '@/components/ui/circular-progress';
import { CheckCircle, CookingPot, Bike, Home, Clock, Wallet, Ban, Star, Repeat, Phone, MapPin, Navigation, PackageCheck, DollarSign, BellRing, Store, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent } from '@/components/ui/alert-dialog';
import { useCart } from '@/context/cart-context';
import { ReviewDialog } from '@/components/review-dialog'; 
import { Button } from '@/components/ui/button';
import { DeliveryReviewCard } from './delivery-review-card';
import { ChatWindow } from './chat-window'; 
import { LocationTracker } from '@/components/location-tracker';

const OrderMap = dynamic(() => import('./order-map'), { 
    ssr: false, 
    loading: () => <Skeleton className="h-full w-full bg-muted animate-pulse" /> 
});

const formatDate = (date: any) => {
    if (!date) return 'Fecha desconocida';
    try {
        let dateObj: Date;
        if (typeof date === 'object' && typeof date.toDate === 'function') {
             dateObj = date.toDate();
        } else if (typeof date === 'string' || typeof date === 'number') {
             dateObj = new Date(date);
        } else if (date instanceof Date) {
             dateObj = date;
        } else {
             return 'Fecha inválida';
        }
        if (isNaN(dateObj.getTime())) return 'Fecha inválida';
        return format(dateObj, "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es });
    } catch (error) {
        return 'Error en fecha';
    }
};

function OrderPageSkeleton() {
    return (
        <div className="container mx-auto">
            <PageHeader title={<Skeleton className="h-9 w-48" />} description={<Skeleton className="h-5 w-64" />} />
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2"><Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent className="space-y-6"><Skeleton className="h-40 w-full" /></CardContent></Card></div>
                 <div className="md:col-span-1"><Card><CardHeader><CardTitle>Mapa de Entrega</CardTitle></CardHeader><CardContent className="h-64"><Skeleton className="h-full w-full" /></CardContent></Card></div>
             </div>
        </div>
    )
}

// Las 5 columnas fijas que se ven en la barra de progreso (no cambiar sin
// ajustar el grid-cols-5 más abajo). statusSteps abajo puede mapear MÁS
// estados que estos (estados intermedios como "Listo para recoger"/"En
// camino") usando un step fraccionario, sin agregar columnas nuevas.
const DISPLAY_STEPS = [
  { step: 0, label: 'Pendiente', icon: Clock },
  { step: 1, label: 'Por Pagar', icon: Wallet },
  { step: 2, label: 'Preparando', icon: CookingPot },
  { step: 3, label: 'En Reparto', icon: Bike },
  { step: 4, label: 'Entregado', icon: Home },
];

const statusSteps: any = {
  'Pendiente de Confirmación': { step: 0, label: 'Pendiente', icon: Clock, description: 'Esperando que la tienda confirme stock.' },
  'Pendiente de Pago': { step: 1, label: 'Por Pagar', icon: Wallet, description: 'Stock confirmado. Realiza el pago.' },
  'En preparación': { step: 2, label: 'Preparando', icon: CookingPot, description: 'La tienda está preparando tu pedido.' },
  'Listo para recoger': { step: 2.3, label: 'Listo para recoger', icon: PackageCheck, description: 'Tu pedido está listo. Buscando un repartidor disponible.' },
  'En camino': { step: 2.7, label: 'Repartidor asignado', icon: Bike, description: 'Un repartidor fue asignado y va a retirar tu pedido de la tienda.' },
  'En reparto': { step: 3, label: 'En Reparto', icon: Bike, description: 'Un repartidor ha recogido tu pedido y está en camino.' },
  'Entregado': { step: 4, label: 'Entregado', icon: Home, description: '¡Tu pedido ha sido entregado! Disfrútalo.' },
  'Cancelado': { step: -1, label: 'Cancelado', icon: Ban, description: 'Este pedido ha sido cancelado.' },
  'Rechazado': { step: -1, label: 'Rechazado', icon: Ban, description: 'La tienda no pudo tomar tu pedido en este momento.' },
};

function OrderProgress({ status }: { status: any }) {
    const currentStatusInfo = statusSteps[status] || { step: 0, label: 'Desconocido', icon: Clock, description: '' };
    const totalSteps = 4;
    const progressValue = (currentStatusInfo.step / totalSteps) * 100;

    if (status === 'Cancelado' || status === 'Rechazado') {
        return ( <div className="text-center"><Ban className="mx-auto h-12 w-12 text-destructive" /><h3 className="mt-2 text-lg font-semibold">{status}</h3><p className="text-sm text-muted-foreground">{currentStatusInfo.description}</p></div>)
    }
    const steps = DISPLAY_STEPS;
    const CurrentIcon = currentStatusInfo.icon;
    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <CircularProgress value={progressValue} size={64} strokeWidth={6}>
                    <CurrentIcon className="h-6 w-6 text-primary" />
                </CircularProgress>
                <div>
                    <p className="font-headline font-bold text-lg">{currentStatusInfo.label}</p>
                    <p className="text-sm text-muted-foreground">{Math.round(progressValue)}% del camino</p>
                </div>
            </div>
            <div>
                <Progress value={progressValue} className="h-2" />
                <div className="mt-4 grid grid-cols-5 gap-2 text-center text-[10px] lg:text-xs">
                    {steps.map((stepInfo:any) => (
                        <div key={stepInfo.step} className={cn("flex flex-col items-center gap-1.5", currentStatusInfo.step >= stepInfo.step ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                            <stepInfo.icon className="h-5 w-5" /><span>{stepInfo.label}</span>
                        </div>
                    ))}
                </div>
            </div>
             <Alert><currentStatusInfo.icon className="h-4 w-4" /><AlertTitle>{currentStatusInfo.label}</AlertTitle><AlertDescription>{currentStatusInfo.description}{status === 'En preparación' && (<p className="mt-2 text-base font-bold text-primary">Entrega estimada: 25-40 min</p>)}</AlertDescription></Alert>
        </div>
    )
}

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, userProfile: myUserProfile, loading: authLoading } = useAuth(); 
  const firestore = useFirestore();
  const { clearCart, addToCart, storeId: cartStoreId } = useCart();
  
  const [reviewingItem, setReviewingItem] = useState<any | null>(null);
  const [isStoreReviewOpen, setIsStoreReviewOpen] = useState(false);
  const [isReorderAlertOpen, setReorderAlertOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  const processedPayment = useRef(false);

  const orderRef = useMemoFirebase(() => firestore ? doc(firestore, 'orders', orderId) : null, [firestore, orderId]);
  const { data: order, isLoading: orderLoading } = useDoc<Order>(orderRef);

  // Nota: antes había acá un useDoc leyendo users/{order.userId} (el perfil del
  // comprador) para mostrárselo a la tienda/repartidor -- pero las reglas de Firestore
  // solo dejan que cada usuario lea su propio perfil, así que esa lectura SIEMPRE
  // fallaba con "Missing or insufficient permissions" para cualquiera que no fuera el
  // propio comprador (no rompía la página, solo ensuciaba la consola). Se sacó: el
  // nombre/teléfono del comprador ya están guardados en la orden misma
  // (customerName/customerPhoneNumber), no hace falta esa lectura cruzada.

  const isLoading = authLoading || orderLoading;

  useEffect(() => {
    const status = searchParams.get('status');
    if (status && order && !processedPayment.current) {
        if (status === 'success') {
            processedPayment.current = true;
            // El webhook de MercadoPago actualiza Firestore directamente con firma HMAC verificada.
            // El listener en tiempo real (useDoc) reflejará el cambio automáticamente en segundos.
            if (order.status === 'En preparación') {
                toast({
                    title: "¡Pago Exitoso!",
                    description: "Tu pedido ya se está preparando.",
                    className: "bg-success/10 border-success/30 text-foreground"
                });
            } else {
                toast({
                    title: "¡Pago recibido!",
                    description: "Verificando con MercadoPago... El estado se actualizará en instantes.",
                    className: "bg-success/10 border-success/30 text-foreground"
                });
            }
            router.replace(`/orders/${orderId}`);
        } else if (status === 'failure') {
            toast({
                variant: "destructive",
                title: "El pago no se procesó",
                description: "Podés reintentar el pago desde la página del pedido.",
            });
            router.replace(`/orders/${orderId}?retry=true`);
        }
    }
  }, [searchParams, order, router, toast, orderId]);

  useEffect(() => {
    if (!isLoading && order && myUserProfile) {
      const isOwner = myUserProfile.role === 'store' && myUserProfile.storeId === order.storeId;
      const isBuyer = user?.uid === order.userId;
      const isAssignedDriver = user?.uid === order.deliveryPersonId;
      const isAdmin = myUserProfile.role === 'admin';
      
      const isDelivery = myUserProfile.role === 'delivery';
      const canAccessAsDriver = isDelivery && (!order.deliveryPersonId || order.deliveryPersonId === user?.uid);

      if (!isOwner && !isBuyer && !isAdmin && !canAccessAsDriver) {
          console.warn("⛔ Acceso denegado a pedido:", orderId);
          router.push('/orders'); 
      }
    } else if (!isLoading && !order && !orderLoading) {
        notFound();
    }
  }, [order, isLoading, user, myUserProfile, router, orderLoading, orderId]);
  
    const handleReviewSubmit = async (rating: number, review: string) => {
        if (!reviewingItem || !order || !firestore) return;
        const updatedItems = order.items.map(item => item.id === reviewingItem.id ? { ...item, userRating: rating } : item);
        try {
            await updateDoc(orderRef!, { items: updatedItems });
             toast({ title: "¡Reseña enviada!", description: "Gracias por tu opinión." });
            setReviewingItem(null);
        } catch (error) { toast({ variant: 'destructive', title: "Error" }); }
    };

    const handleDeliveryReviewSubmit = async (rating: number, review: string) => {
        if (!order || !user) return;
        const res = await authedFetch('/api/delivery-reviews/create', user, { orderId: order.id, userId: user.uid, rating, comment: review });
        const data = await res.json();
        if (!res.ok) {
            toast({ variant: 'destructive', title: "Error", description: data.error || 'No se pudo enviar la reseña.' });
            throw new Error(data.error);
        }
        toast({ title: "¡Reseña enviada!", description: "Se ha valorado al repartidor." });
    };

    const handleStoreReviewSubmit = async (rating: number, comment: string) => {
        if (!order || !user) return;
        const res = await authedFetch('/api/reviews/create', user, { orderId: order.id, userId: user.uid, rating, comment });
        const data = await res.json();
        if (!res.ok) {
            toast({ variant: 'destructive', title: "Error", description: data.error || 'No se pudo enviar la reseña.' });
            throw new Error(data.error);
        }
        toast({ title: "¡Gracias por tu reseña!", description: `Calificaste a ${order.storeName} con ${rating} estrella${rating === 1 ? '' : 's'}.` });
    };

    const executeReorder = () => {
        if (!order) return;
        clearCart();
        order.items.forEach(item => {
            addToCart({
                id: item.id,
                name: item.name,
                price: item.price,
                description: item.description || '',
                category: item.category || 'General',
                imageUrl: item.imageUrl || '',
            }, order.storeId);
        });
        toast({ title: "Productos agregados", description: "Revisa tu carrito para finalizar la compra." });
    };

    const handleReorderClick = () => {
        if (!order) return;
        if (cartStoreId && cartStoreId !== order.storeId) {
            setReorderAlertOpen(true);
        } else {
            executeReorder();
        }
    }

    const handleAcceptOrder = async () => {
        if (!user || !orderRef || !order || !firestore) return;
        setIsAccepting(true);
        try {
            const driverName = myUserProfile?.displayName || 'Repartidor';
            await updateDoc(orderRef, {
                deliveryPersonId: user.uid,
                deliveryPersonName: driverName,
                status: 'En camino',
                takenAt: serverTimestamp()
            });
            toast({ title: "¡Pedido Aceptado!", description: "Ve a la tienda a retirarlo." });

            // Avisar a la tienda y al comprador — este botón es un camino alternativo al
            // de "Panel de Entregas" (delivery-orders-view.tsx), que ya hace esto mismo.
            const targetStoreUser = order.storeOwnerId || order.storeId;
            if (targetStoreUser) {
                OrderService.sendNotification(
                    firestore, targetStoreUser, "🛵 Repartidor en camino",
                    `${driverName} aceptó el pedido y va a retirarlo.`, "order_status", order.id, user
                ).catch(console.error);
            }
            if (order.userId) {
                OrderService.sendNotification(
                    firestore, order.userId, "🛵 Repartidor Asignado",
                    "Un repartidor está yendo a retirar tu pedido.", "order_status", order.id, user
                ).catch(console.error);
            }
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo aceptar el pedido." });
        } finally {
            setIsAccepting(false);
        }
    }

    const handleUpdateStatus = async (newStatus: string) => {
        if (!orderRef || !order || !firestore) return;
        // Prevenir doble actualización al mismo estado (doble click, llamadas duplicadas)
        if (order.status === newStatus) return;
        setIsUpdatingStatus(true);
        try {
            // updateOrderStatus ya manda el aviso correspondiente al comprador
            // (ej: "🚀 ¡En Camino a tu casa!" al pasar a En reparto).
            await updateOrderStatus(firestore, order.id, newStatus as Order['status'], user);
            toast({ title: "Estado actualizado", description: `El pedido ahora está: ${newStatus}` });
        } catch (error) {
            toast({ variant: 'destructive', title: "Error", description: "No se pudo actualizar el estado." });
        } finally {
            setIsUpdatingStatus(false);
        }
    }

    const handleNotifyDriver = async () => {
        if (!firestore || !order || !myUserProfile || !orderRef) return;
        setIsUpdatingStatus(true);
        try {
            const messageData = {
                senderId: user!.uid,
                senderName: myUserProfile.displayName || 'Tienda',
                senderRole: 'store',
                text: "🔔 ¡El pedido está listo para recoger! Pasa por el mostrador.",
                createdAt: serverTimestamp(),
            };
            await addDoc(collection(firestore, 'order_chats', order.id, 'messages'), messageData);
            await updateDoc(orderRef, { readyForPickup: true });
            if (order.deliveryPersonId) {
                await OrderService.sendNotification(
                    firestore,
                    order.deliveryPersonId,
                    "📦 ¡Pedido Listo!",
                    `La tienda ${order.storeName} ya tiene el pedido listo para retirar.`,
                    "delivery",
                    order.id,
                    user
                );
            }
            toast({ title: "Repartidor notificado", description: "Se ha enviado la alerta a su dispositivo." });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo enviar la notificación." });
        } finally {
            setIsUpdatingStatus(false);
        }
    }

  if (isLoading || !order) return <OrderPageSkeleton />;

  const displayTotal = order.total || (order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.deliveryFee);
  const isBuyer = user?.uid === order.userId;
  const isStoreOwner = myUserProfile?.role === 'store' && myUserProfile?.storeId === order.storeId;
  const isDeliveryPerson = myUserProfile?.role === 'delivery' && user?.uid === order.deliveryPersonId;
  const isDelivery = myUserProfile?.role === 'delivery';

  const isAvailableToAccept = isDelivery && !order.deliveryPersonId && (order.status === 'En preparación' || order.status === 'Listo para recoger');
  const showRightColumn = isStoreOwner || isDelivery || isBuyer;
  const phoneToCall = isDeliveryPerson ? order.customerPhoneNumber : undefined;
  const paymentFailed = searchParams.get('retry') === 'true' && isBuyer && order.status === 'Pendiente de Pago';

  const handleRetryPayment = async () => {
    if (!order || !user) return;
    try {
      const res = await authedFetch('/api/checkout', user, {
        orderId: order.id,
        items: order.items,
        payerEmail: user.email,
        userId: user.uid,
        storeId: order.storeId,
        storeOwnerId: order.storeOwnerId,
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo iniciar el pago.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo conectar con el servidor de pagos.' });
    }
  };

  return (
    <div className="container mx-auto">
      <LocationTracker 
        orderId={order.id} 
        isDriver={!!isDeliveryPerson} 
        status={order.status} 
      />

      <AlertDialog open={isReorderAlertOpen} onOpenChange={setReorderAlertOpen}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitleComponent>¿Vaciar carrito actual?</AlertDialogTitleComponent><AlertDialogDescriptionComponent>Tu carrito contiene productos de otra tienda.</AlertDialogDescriptionComponent></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={executeReorder}>Sí, vaciar y repetir</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {paymentFailed && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Pago no procesado</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 mt-2">
            <span>Tu pedido quedó pendiente de pago. Podés reintentar el pago ahora.</span>
            <Button variant="destructive" size="sm" className="w-fit" onClick={handleRetryPayment}>
              Reintentar pago
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        title={`Pedido #${order.id.substring(0,7)}...`}
        description={`Realizado el ${formatDate(order.createdAt)}`}
      >
        {isBuyer && order.status === 'Entregado' && (<Button onClick={handleReorderClick}><Repeat className="mr-2 h-4 w-4" />Volver a Pedir</Button>)}
      </PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8"> 
        
        <div className={cn("space-y-8", showRightColumn ? "lg:col-span-3" : "lg:col-span-5")}>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Store className="h-5 w-5 text-muted-foreground" />
                        {order.storeName}
                    </CardTitle>
                    <CardDescription>
                        {isStoreOwner && order.customerName 
                            ? <span>Cliente: <strong>{order.customerName}</strong></span>
                            : <span>Detalles de tu compra</span>
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* ACCIONES REPARTIDOR */}
                    {isAvailableToAccept && (
                        <div className="mb-6 bg-success/10 border border-success/30 rounded-xl overflow-hidden shadow-sm animate-in fade-in zoom-in duration-300">
                            <div className="p-4 bg-success/15 border-b border-success/30 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-success flex items-center gap-2"><Bike className="h-5 w-5" /> Solicitud de Entrega</h3>
                                <span className="bg-success text-success-foreground px-3 py-1 rounded-full font-bold text-sm">+${order.deliveryFee.toFixed(2)}</span>
                            </div>
                            <div className="p-4 space-y-3 text-center">
                                <p className="text-foreground mb-2">Este pedido está listo o preparándose. ¿Quieres llevarlo?</p>
                                <Button className="w-full bg-success hover:bg-success/90 text-success-foreground shadow-md transition-all hover:scale-[1.02]" size="lg" onClick={handleAcceptOrder} disabled={isAccepting}>
                                    {isAccepting ? "Aceptando..." : "✅ Aceptar y Asignarme este Pedido"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ACCIONES TIENDA */}
                    {isStoreOwner && order.status === 'En preparación' && order.deliveryPersonId && (
                         <div className="mb-6 bg-info/10 border border-info/30 rounded-xl p-4">
                            <h3 className="text-md font-bold text-info mb-2">Coordinación de Entrega</h3>
                            <p className="text-sm text-muted-foreground mb-3">Cuando termines de preparar, avisa al repartidor con un toque.</p>
                            <Button className="w-full bg-info hover:bg-info/90 text-info-foreground" onClick={handleNotifyDriver} disabled={isUpdatingStatus || (order as any).readyForPickup}>
                                <BellRing className="mr-2 h-4 w-4" /> {isUpdatingStatus ? "Enviando..." : ((order as any).readyForPickup ? "Repartidor Notificado" : "¡Pedido Listo! Avisar Repartidor")}
                            </Button>
                        </div>
                    )}

                    {/* ESTADO DE ENTREGA REPARTIDOR */}
                    {isDeliveryPerson && order.status !== 'Entregado' && order.status !== 'Cancelado' && (
                        <div className="mb-6 bg-muted/30 border border-border rounded-xl overflow-hidden shadow-sm">
                            <div className="p-4 bg-muted border-b border-border flex justify-between items-center">
                                <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Navigation className="h-5 w-5" /> Tu Misión</h3>
                                <div className="text-xs font-mono bg-background px-2 py-1 rounded border">
                                    {(order.status === 'En camino' || order.status === 'En preparación' || order.status === 'Listo para recoger') ? 'FASE 1: TIENDA' : 'FASE 2: CLIENTE'}
                                </div>
                            </div>
                            
                            <div className="p-4 space-y-4">
                                {(order as any).readyForPickup && (order.status === 'En preparación' || order.status === 'En camino') && (
                                    <div className="p-3 bg-success/15 text-success rounded-lg border border-success/30 font-semibold text-center flex items-center justify-center gap-2 animate-pulse"><BellRing className="h-5 w-5" /> ¡Pedido LISTO para recoger!</div>
                                )}

                                <div className="grid grid-cols-1 gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-background p-2 rounded-full border shadow-sm mt-1">
                                            {order.status === 'En reparto' ? <Home className="h-5 w-5 text-primary"/> : <Store className="h-5 w-5 text-info"/>}
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-bold">Destino Actual:</p>
                                            <p className="text-lg font-medium leading-tight">
                                                {order.status === 'En reparto' 
                                                    ? (order.shippingInfo?.address || order.shippingAddress?.address) 
                                                    : order.storeAddress
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    {order.status === 'En reparto' && phoneToCall && (
                                        <a href={`tel:${phoneToCall}`} className="w-full">
                                            <Button variant="outline" className="w-full border-success/30 text-success bg-success/10 hover:bg-success/15">
                                                <Phone className="mr-2 h-4 w-4" /> Llamar al Cliente ({phoneToCall})
                                            </Button>
                                        </a>
                                    )}
                                </div>

                                <Separator />
                                
                                {(order.status === 'En camino' || order.status === 'En preparación' || order.status === 'Listo para recoger') && (
                                    <Button className="w-full bg-info hover:bg-info/90 text-info-foreground h-14 text-xl shadow-md" onClick={() => handleUpdateStatus('En reparto')} disabled={isUpdatingStatus}>
                                        <PackageCheck className="mr-2 h-6 w-6" /> {isUpdatingStatus ? "..." : "Ya recogí el pedido"}
                                    </Button>
                                )}
                                {order.status === 'En reparto' && (
                                    <Button className="w-full bg-success hover:bg-success/90 text-success-foreground h-14 text-xl shadow-md" onClick={() => handleUpdateStatus('Entregado')} disabled={isUpdatingStatus}>
                                        <CheckCircle className="mr-2 h-6 w-6" /> {isUpdatingStatus ? "..." : "Confirmar Entrega"}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    {isDeliveryPerson && order.status === 'Entregado' && (
                         <div className="mb-6 bg-muted/30 border border-border rounded-xl p-4 flex flex-col items-center text-center">
                            <div className="h-12 w-12 bg-success/15 rounded-full flex items-center justify-center mb-3"><CheckCircle className="h-6 w-6 text-success" /></div>
                            <h3 className="text-lg font-bold text-foreground">¡Entrega Completada!</h3>
                            <div className="mt-2 px-4 py-2 bg-success text-success-foreground rounded-full font-bold text-lg flex items-center gap-2 shadow-sm"><DollarSign className="h-5 w-5" />Ganaste ${order.deliveryFee.toFixed(2)}</div>
                        </div>
                    )}

                    <CardDescription>
                        <span className="font-semibold text-primary">{order.storeName}</span> 
                        {isStoreOwner && order.customerName && (<span className="text-muted-foreground ml-2">para **{order.customerName}**</span>)}
                        {!isStoreOwner && <span className="text-muted-foreground">Pedido a</span>}
                    </CardDescription>

                    <CardDescription>Estado actual: <span className="font-bold text-primary">{order.status}</span></CardDescription>
                    <Separator/>
                    {order.items.map(item => (
                        <div key={item.id} className="flex justify-between items-center">
                            <div>
                                {/* ✅ FIX: Buscamos 'name' o 'title' */}
                                <p className="font-semibold">{item.name || (item as any).title || "Producto sin nombre"}</p>
                                <p className="text-sm text-muted-foreground">Cantidad: {item.quantity}</p>
                            </div>
                            <div className="text-right flex items-center gap-4">
                               {isBuyer && order.status === 'Entregado' && (
                                   item.userRating 
                                   ? (<div className="flex items-center gap-1 text-sm text-warning"><Star className="h-4 w-4 fill-current" /><span className="font-bold">{item.userRating}</span></div>)
                                   : (<Button variant="outline" size="sm" onClick={() => setReviewingItem(item)}><Star className="mr-2 h-4 w-4" /> Valorar</Button>)
                                )}<p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                        </div>
                    ))}
                    <Separator/>
                     <div className="flex justify-between text-sm"><p>Subtotal</p><p>${(order.subtotal || (displayTotal - order.deliveryFee)).toFixed(2)}</p></div>
                     <div className="flex justify-between text-sm"><p>Envío</p><p>${order.deliveryFee.toFixed(2)}</p></div>
                     {(order.serviceFee || 0) > 0 && (
                        <div className="flex justify-between text-sm"><p>Tarifa de Servicio</p><p>${order.serviceFee?.toFixed(2)}</p></div>
                     )}
                    <Separator/><div className="flex justify-between font-bold text-lg"><p>Total</p><p>${displayTotal.toFixed(2)}</p></div>
                     <Separator/>
                     
                     {isStoreOwner && (
                        <div className="border-t pt-4 space-y-2">
                           <h3 className="font-semibold text-lg">Contacto del Cliente</h3>
                           <p className="text-sm text-muted-foreground flex items-center"><Phone className="h-4 w-4 mr-2" />Teléfono: {order.customerPhoneNumber || 'No especificado'}</p>
                        </div>
                     )}
                     
                     <div>
                        <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Dirección de Envío (Referencia)</h3>
                        <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded border mt-1">
                            {order.shippingInfo?.address || order.shippingAddress?.address}
                        </p>
                     </div>
                </CardContent>
                 
                 <OrderStatusUpdater order={order} />
            </Card>
             <Card><CardHeader><CardTitle>Estado del Pedido</CardTitle></CardHeader><CardContent><OrderProgress status={order.status} /></CardContent></Card>
        </div>

        {/* --- COLUMNA DERECHA --- */}
        <div className={cn("space-y-8", showRightColumn ? "lg:col-span-2" : "hidden")}>
             <Card>
                <CardHeader><CardTitle>Mapa de Entrega</CardTitle></CardHeader>
                <CardContent className="h-96">{order.storeCoords && order.customerCoords ? (<OrderMap order={order} />) : <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">Sin datos de ubicación.</div>}</CardContent><CardFooter><p className="text-xs text-muted-foreground"> {order.status === 'En reparto' ? "La línea representa la ruta de entrega directa desde la tienda hasta tu ubicación." : "Los iconos marcan la ubicación de la tienda y la dirección de entrega."}</p></CardFooter>
            </Card>
            
            {(isStoreOwner || isDeliveryPerson || isBuyer) && (
                <ChatWindow order={order} />
            )}

            {isBuyer && order.status === 'Entregado' && (
                <Card>
                    <CardHeader><CardTitle>Reseña de la tienda</CardTitle></CardHeader>
                    <CardContent>
                        {order.storeReviewed ? (
                            <p className="text-sm text-muted-foreground">¡Gracias por calificar a <strong>{order.storeName}</strong>!</p>
                        ) : (
                            <div className="flex items-center justify-between gap-4">
                                <p className="text-sm text-muted-foreground">¿Qué te pareció tu pedido en {order.storeName}?</p>
                                <Button variant="outline" size="sm" onClick={() => setIsStoreReviewOpen(true)}>
                                    <Star className="mr-2 h-4 w-4" /> Calificar
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {isBuyer && order.status === 'Entregado' && order.deliveryPersonName && (
                order.deliveryReviewed ? (
                    <Card><CardHeader><CardTitle>Tu Valoración de la Entrega</CardTitle></CardHeader><CardContent className="space-y-2"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map(star => (<Star key={star} className={cn('h-5 w-5', order.deliveryRating && order.deliveryRating >= star ? 'text-warning fill-warning' : 'text-muted-foreground/30')} />))}<span className="ml-2 font-bold text-lg">{order.deliveryRating}/5</span></div>{order.deliveryReview && (<blockquote className="border-l-2 pl-4 italic text-muted-foreground">&quot;{order.deliveryReview}&quot;</blockquote>)}<p className="text-xs text-muted-foreground pt-2">Valoración para {order.deliveryPersonName}.</p></CardContent></Card>
                ) : (
                    <DeliveryReviewCard order={order} onSubmit={handleDeliveryReviewSubmit} />
                )
            )}
        </div>
      </div>
       
       {reviewingItem && (
           <ReviewDialog
               isOpen={!!reviewingItem}
               setIsOpen={(isOpen) => !isOpen && setReviewingItem(null)}
               productName={reviewingItem.name}
               onSubmit={handleReviewSubmit}
           />
       )}
       {order && (
           <ReviewDialog
               isOpen={isStoreReviewOpen}
               setIsOpen={setIsStoreReviewOpen}
               title="Calificar Tienda"
               productName={order.storeName}
               onSubmit={handleStoreReviewSubmit}
           />
       )}
    </div>
  );
}