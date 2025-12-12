'use client';

import { useParams, useRouter, notFound, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type Order, OrderService } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderStatusUpdater } from './order-status-updater';
import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, UserProfile } from '@/context/auth-context'; 
import { useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'; 
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, CookingPot, Bike, Home, Clock, Wallet, Ban, Star, Repeat, Phone, Mail, MapPin, Navigation, PackageCheck, DollarSign, BellRing, Store, ExternalLink } from 'lucide-react';
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

const statusSteps: any = {
  'Pendiente de Confirmación': { step: 0, label: 'Pendiente', icon: Clock, description: 'Esperando que la tienda confirme stock.' },
  'Pendiente de Pago': { step: 1, label: 'Por Pagar', icon: Wallet, description: 'Stock confirmado. Realiza el pago.' },
  'En preparación': { step: 2, label: 'Preparando', icon: CookingPot, description: 'La tienda está preparando tu pedido.' },
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
    const steps = Object.values(statusSteps).filter((s:any) => s.step >= 0 && s.step <= totalSteps).sort((a:any,b:any) => a.step - b.step);
    return (
        <div className="space-y-8">
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
  const [isReorderAlertOpen, setReorderAlertOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  const processedPayment = useRef(false);

  const orderRef = useMemoFirebase(() => firestore ? doc(firestore, 'orders', orderId) : null, [firestore, orderId]);
  const { data: order, isLoading: orderLoading } = useDoc<Order>(orderRef);

  const customerProfileRef = useMemoFirebase(() => {
    if (!firestore || !order?.userId) return null;
    return doc(firestore, 'users', order.userId);
  }, [firestore, order?.userId]);

  const { data: customerProfile } = useDoc<UserProfile>(customerProfileRef); 

  const isLoading = authLoading || orderLoading;

  useEffect(() => {
    const status = searchParams.get('status');
    if (status && order && !processedPayment.current) {
        if (status === 'success' && order.status === 'Pendiente de Pago') {
            processedPayment.current = true;
            const confirmPayment = async () => {
                if(!orderRef) return;
                try {
                    const response = await fetch('/api/orders/confirm-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderId: order.id })
                    });
                    if (response.ok) {
                        toast({ 
                            title: "¡Pago Exitoso!", 
                            description: "Tu pedido ya se está preparando.",
                            className: "bg-green-50 border-green-200 text-green-900"
                        });
                        router.replace(`/orders/${orderId}`);
                    }
                } catch (e) {
                    console.error("Error confirmando pago:", e);
                }
            };
            confirmPayment();
        } else if (status === 'failure') {
            toast({ variant: "destructive", title: "El pago falló", description: "Intenta nuevamente." });
            router.replace(`/orders/${orderId}`);
        }
    }
  }, [searchParams, order, orderRef, router, toast, orderId]);

  useEffect(() => {
    if (!isLoading && order && myUserProfile) {
      const isOwner = myUserProfile.role === 'store' && myUserProfile.storeId === order.storeId;
      const isBuyer = user?.uid === order.userId;
      const isAssignedDriver = user?.uid === order.deliveryPersonId;
      const isAdmin = myUserProfile.role === 'admin';
      
      const isDelivery = myUserProfile.role === 'delivery';
      // Permitimos ver si eres delivery y (es tu pedido O no tiene dueño y está listo)
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
        if (!order || !orderRef) return;
        try {
            await updateDoc(orderRef, { deliveryRating: rating, deliveryReview: review });
            toast({ title: "¡Reseña enviada!", description: "Se ha valorado al repartidor." });
        } catch (error) { toast({ variant: 'destructive', title: "Error" }); }
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
        if (!user || !orderRef) return;
        setIsAccepting(true);
        try {
            await updateDoc(orderRef, { 
                deliveryPersonId: user.uid,
                deliveryPersonName: myUserProfile?.displayName || 'Repartidor'
            });
            toast({ title: "¡Pedido Aceptado!", description: "Ahora puedes ver los detalles y chatear con la tienda." });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo aceptar el pedido." });
        } finally {
            setIsAccepting(false);
        }
    }

    const handleUpdateStatus = async (newStatus: string) => {
        if (!orderRef) return;
        setIsUpdatingStatus(true);
        try {
            await updateDoc(orderRef, { status: newStatus });
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
                    order.id
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

    // Función de Navegación Inteligente
    const startNavigation = (lat: number | undefined, lng: number | undefined, addressFallback: string | undefined) => {
        if (lat && lng) {
            window.open(`http://googleusercontent.com/maps.google.com/?q=${lat},${lng}`, '_blank');
        } else if (addressFallback) {
            const encoded = encodeURIComponent(addressFallback);
            window.open(`http://googleusercontent.com/maps.google.com/?q=${encoded}`, '_blank');
        } else {
            toast({ variant: "destructive", title: "Sin datos", description: "No hay ubicación disponible para navegar." });
        }
    }

  if (isLoading || !order) return <OrderPageSkeleton />;
  
  const displayTotal = order.total || (order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.deliveryFee);
  const isBuyer = user?.uid === order.userId;
  const isStoreOwner = myUserProfile?.role === 'store' && myUserProfile?.storeId === order.storeId; 
  const isDeliveryPerson = myUserProfile?.role === 'delivery' && user?.uid === order.deliveryPersonId;
  const isDelivery = myUserProfile?.role === 'delivery';
  const isAvailableToAccept = isDelivery && !order.deliveryPersonId && order.status === 'En preparación';
  
  // ✅ CORRECCIÓN CLAVE: El cliente (isBuyer) también debe ver la columna derecha donde está el chat
  const showRightColumn = isStoreOwner || isDelivery || isBuyer;

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
                        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in zoom-in duration-300">
                            <div className="p-4 bg-green-100 border-b border-green-200 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-green-900 flex items-center gap-2"><Bike className="h-5 w-5" /> Solicitud de Entrega</h3>
                                <span className="bg-green-600 text-white px-3 py-1 rounded-full font-bold text-sm">+${order.deliveryFee.toFixed(2)}</span>
                            </div>
                            <div className="p-4 space-y-3 text-center">
                                <p className="text-green-800 mb-2">Este pedido está listo o preparándose. ¿Quieres llevarlo?</p>
                                <Button className="w-full bg-green-600 hover:bg-green-700 text-white shadow-md transition-all hover:scale-[1.02]" size="lg" onClick={handleAcceptOrder} disabled={isAccepting}>
                                    {isAccepting ? "Aceptando..." : "✅ Aceptar y Asignarme este Pedido"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ACCIONES TIENDA */}
                    {isStoreOwner && order.status === 'En preparación' && order.deliveryPersonId && (
                         <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <h3 className="text-md font-bold text-blue-900 mb-2">Coordinación de Entrega</h3>
                            <p className="text-sm text-blue-800 mb-3">Cuando termines de preparar, avisa al repartidor con un toque.</p>
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleNotifyDriver} disabled={isUpdatingStatus || (order as any).readyForPickup}>
                                <BellRing className="mr-2 h-4 w-4" /> {isUpdatingStatus ? "Enviando..." : ((order as any).readyForPickup ? "Repartidor Notificado" : "¡Pedido Listo! Avisar Repartidor")}
                            </Button>
                        </div>
                    )}

                    {/* ESTADO DE ENTREGA REPARTIDOR */}
                    {isDeliveryPerson && order.status === 'Entregado' && (
                         <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col items-center text-center">
                            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-3"><CheckCircle className="h-6 w-6 text-green-600" /></div>
                            <h3 className="text-lg font-bold text-gray-900">¡Entrega Completada!</h3>
                            <p className="text-sm text-gray-600 mb-3">Has completado esta entrega exitosamente.</p>
                            <div className="px-4 py-2 bg-green-600 text-white rounded-full font-bold text-lg flex items-center gap-2 shadow-sm"><DollarSign className="h-5 w-5" />Ganaste ${order.deliveryFee.toFixed(2)}</div>
                        </div>
                    )}

                    {isDeliveryPerson && order.status !== 'Entregado' && order.status !== 'Cancelado' && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="p-4 bg-blue-100 border-b border-blue-200"><h3 className="text-lg font-bold text-blue-900 flex items-center gap-2"><Navigation className="h-5 w-5" /> Tu Misión Actual</h3></div>
                            <div className="p-4 space-y-4">
                                {(order as any).readyForPickup && order.status === 'En preparación' && (
                                    <div className="p-3 bg-green-100 text-green-800 rounded-lg border border-green-300 font-semibold text-center flex items-center justify-center gap-2 animate-pulse"><BellRing className="h-5 w-5" /> ¡La tienda marcó el pedido como LISTO!</div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <Button 
                                        variant="outline" 
                                        className="bg-white hover:bg-gray-50 border-blue-200 text-blue-700" 
                                        onClick={() => startNavigation(order.storeCoords?.latitude, order.storeCoords?.longitude, "Dirección Tienda")}
                                    >
                                        <MapPin className="mr-2 h-4 w-4" /> Ir a Tienda
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        className="bg-white hover:bg-gray-50 border-blue-200 text-blue-700" 
                                        onClick={() => startNavigation(order.customerCoords?.latitude, order.customerCoords?.longitude, order.shippingInfo?.address || order.shippingAddress?.address)}
                                    >
                                        <Navigation className="mr-2 h-4 w-4" /> Ir a Cliente
                                    </Button>
                                </div>
                                <Separator className="bg-blue-200"/>
                                {order.status === 'En preparación' && (
                                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-lg" onClick={() => handleUpdateStatus('En reparto')} disabled={isUpdatingStatus}><PackageCheck className="mr-2 h-5 w-5" /> {isUpdatingStatus ? "Actualizando..." : "Ya recogí el pedido"}</Button>
                                )}
                                {order.status === 'En reparto' && (
                                    <Button className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-lg" onClick={() => handleUpdateStatus('Entregado')} disabled={isUpdatingStatus}><CheckCircle className="mr-2 h-5 w-5" /> {isUpdatingStatus ? "Finalizando..." : "Confirmar Entrega"}</Button>
                                )}
                            </div>
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
                            <div><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">Cantidad: {item.quantity}</p></div>
                            <div className="text-right flex items-center gap-4">
                               {isBuyer && order.status === 'Entregado' && (
                                   item.userRating 
                                   ? (<div className="flex items-center gap-1 text-sm text-amber-500"><Star className="h-4 w-4 fill-current" /><span className="font-bold">{item.userRating}</span></div>) 
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
                     
                     {isStoreOwner && customerProfile && (
                        <div className="border-t pt-4 space-y-2">
                           <h3 className="font-semibold text-lg">Contacto del Cliente</h3>
                           <p className="text-sm text-muted-foreground flex items-center"><Phone className="h-4 w-4 mr-2" />Teléfono: {order.customerPhoneNumber || customerProfile.phoneNumber || 'No especificado'}</p>
                           <p className="text-sm text-muted-foreground flex items-center"><Mail className="h-4 w-4 mr-2" />Email: {customerProfile.email}</p>
                        </div>
                     )}
                     <div>
                        <h3 className="font-semibold">Dirección de Envío</h3>
                        <p className="text-sm text-muted-foreground">{order.shippingInfo?.address || order.shippingAddress?.address}</p>
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
            
            {/* ✅ CORRECCIÓN CLAVE: El cliente (isBuyer) ahora ve el chat */}
            {(isStoreOwner || isDeliveryPerson || isBuyer) && (
                <ChatWindow order={order} />
            )}

            {isBuyer && order.status === 'Entregado' && order.deliveryPersonName && (
                order.deliveryRating ? (
                    <Card><CardHeader><CardTitle>Tu Valoración de la Entrega</CardTitle></CardHeader><CardContent className="space-y-2"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map(star => (<Star key={star} className={cn('h-5 w-5', order.deliveryRating && order.deliveryRating >= star ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30')} />))}<span className="ml-2 font-bold text-lg">{order.deliveryRating}/5</span></div>{order.deliveryReview && (<blockquote className="border-l-2 pl-4 italic text-muted-foreground">"{order.deliveryReview}"</blockquote>)}<p className="text-xs text-muted-foreground pt-2">Valoración para {order.deliveryPersonName}.</p></CardContent></Card>
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
    </div>
  );
}