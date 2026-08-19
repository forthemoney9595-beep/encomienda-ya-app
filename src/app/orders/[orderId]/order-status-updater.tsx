'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import type { Order, OrderStatus } from '@/lib/order-service';
import { updateOrderStatus } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2, XCircle, Clock, ShoppingBag, Ban } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface OrderStatusUpdaterProps {
  order: Order;
}

// Transiciones que la TIENDA puede disparar a mano desde este desplegable genérico.
// A partir de "Listo para recoger" la posta es del repartidor (tomar pedido -> retirar
// -> entregar, todo en delivery-orders-view.tsx) — ahí sí se asigna deliveryPersonId
// y se avisa a quien corresponde. Si la tienda pudiera saltar directo a "En reparto" o
// "Entregado" desde aquí, el pedido queda sin repartidor asignado y nadie se entera.
// "Pendiente de Pago" como destino se sacó del mapa: ese paso SIEMPRE tiene que ir por
// /api/orders/confirm-stock (recalcula el total server-side), nunca por este dropdown
// genérico que escribe directo a Firestore. Ya era inalcanzable en la práctica (los
// escenarios 3/4 de abajo interceptan esos estados antes), pero quedaba como código
// muerto al lado de un handleUpdateStatus(selectedStatus) sin guarda — lo sacamos para
// que la regla de Firestore (que ahora bloquea ese campo/valor por escritura directa)
// nunca tenga la chance de rechazar un click real del usuario.
const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  'pending': [],
  'Pendiente': [],
  'Pendiente de Confirmación': ['Rechazado'],
  'Pendiente de Pago': [],
  'Aceptado': [],
  'En preparación': ['Listo para recoger'],
  'Listo para recoger': [],
  'En camino': [],
  'En reparto': [],
  'Entregado': [],
  'Cancelado': [],
  'Rechazado': [],
};

export function OrderStatusUpdater({ order }: OrderStatusUpdaterProps) {
  const { user: appUser, userProfile } = useAuth();
  const firestore = useFirestore(); // usado por handleUpdateStatus y handleBuyerPayment
  const router = useRouter();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handleCancelOrder = async () => {
    if (!appUser) return;
    setIsUpdating(true);
    try {
      const res = await authedFetch('/api/orders/cancel', appUser, { orderId: order.id, userId: appUser.uid });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      toast({ title: 'Pedido cancelado', description: 'Tu pedido fue cancelado correctamente.' });
      router.refresh();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'No se pudo cancelar el pedido.' });
    } finally {
      setIsUpdating(false);
      setShowCancelDialog(false);
    }
  };

  // Lógica de permisos
  const isStoreOwner = userProfile?.role === 'store' && userProfile?.storeId === order.storeId;
  const isBuyer = appUser?.uid === order.userId;

  const possibleNextStatuses = statusTransitions[order.status] || [];

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!firestore) return;
    setIsUpdating(true);
    try {
      // 'Rechazado' va por API, no por escritura directa: es el único cambio de estado de
      // este dropdown que tiene que DEVOLVER stock al catálogo (las unidades que `create`
      // había reservado). Este era el segundo camino de rechazo — el otro está en
      // store-orders-view.tsx — y olvidarse de uno es exactamente lo que pasó en la Fase R1.
      if (newStatus === 'Rechazado') {
        if (!appUser) return;
        const res = await authedFetch('/api/orders/reject', appUser, { orderId: order.id });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al rechazar');
        toast({
          title: 'Pedido Rechazado',
          description: data.unitsReturned > 0
            ? `${data.unitsReturned} unidad(es) volvieron al stock.`
            : undefined,
        });
        router.refresh();
        return;
      }

      await updateOrderStatus(firestore, order.id, newStatus, appUser);

      // 'Listo para recoger' desde acá era el CAMINO MUDO (Fase RR bis): avisaba al
      // comprador pero a ningún repartidor — el otro camino (botón del panel de la
      // tienda) sí. Misma familia de bug que la Fase R1: dos caminos, uno mudo.
      if (newStatus === 'Listo para recoger' && !order.deliveryPersonId && appUser) {
        try {
          const res = await authedFetch('/api/orders/notify-drivers', appUser, { orderId: order.id });
          const data = await res.json();
          if (res.ok && data.notified > 0) {
            toast({ title: '📢 Repartidores avisados', description: `Se notificó a ${data.notified} repartidor(es).` });
          }
        } catch (e) {
          console.error('No se pudo avisar a los repartidores:', e);
        }
      }

      toast({
          title: 'Estado Actualizado',
          description: `El pedido ahora está "${newStatus}".`,
      });
      router.refresh();
    } catch (error) {
        console.error('Error updating order status:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
    } finally {
        setIsUpdating(false);
        setSelectedStatus('');
    }
  };

  // Reemplaza al todo-o-nada de "Tengo Stock": permite destildar ítems puntuales sin
  // stock antes de confirmar. El total se recalcula siempre server-side (ver
  // /api/orders/confirm-stock), nunca se confía en un total calculado en el cliente.
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set());
  const toggleStockItem = (itemId: string) => {
    setUncheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };
  // Ajuste de cantidad, solo REDUCIR — mismo patrón que store-orders-view (los dos
  // caminos de confirmación tienen que ofrecer lo mismo, lección R1).
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const bumpQty = (itemId: string, delta: number, orderedQty: number) => {
    setQtyOverrides(prev => {
      const current = prev[itemId] ?? orderedQty;
      const next = Math.min(orderedQty, Math.max(1, current + delta));
      const copy = { ...prev };
      if (next === orderedQty) delete copy[itemId]; else copy[itemId] = next;
      return copy;
    });
  };
  const adjustedCount = Object.keys(qtyOverrides).filter(id => !uncheckedIds.has(id)).length;
  const allItemsUnchecked = order.items?.length > 0 && uncheckedIds.size === order.items.length;

  const handleConfirmStock = async () => {
    setIsUpdating(true);
    try {
      const cleanAdjusted = Object.fromEntries(
        Object.entries(qtyOverrides).filter(([id]) => !uncheckedIds.has(id))
      );
      const res = await authedFetch('/api/orders/confirm-stock', appUser, { orderId: order.id, storeId: order.storeId, removedItemIds: Array.from(uncheckedIds), adjustedQuantities: cleanAdjusted });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo confirmar el pedido.');
      const changed = uncheckedIds.size > 0 || Object.keys(cleanAdjusted).length > 0;
      toast({
        title: changed ? 'Confirmado con cambios' : 'Stock Confirmado',
        description: changed
          ? [
              uncheckedIds.size > 0 ? `${uncheckedIds.size} producto(s) sacado(s)` : '',
              Object.keys(cleanAdjusted).length > 0 ? `${Object.keys(cleanAdjusted).length} con cantidad reducida` : '',
            ].filter(Boolean).join(' · ') + '. El cliente ya tiene el nuevo total.'
          : 'El cliente ha sido notificado para pagar.',
      });
      router.refresh();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo confirmar el pedido.' });
    } finally {
      setIsUpdating(false);
    }
  };

  // --- INTEGRACIÓN REAL MERCADOPAGO (Con Limpieza de Datos) ---
  const handleBuyerPayment = async () => {
    if (!order) {
        console.error("❌ Error: No hay objeto 'order'");
        return;
    }
    
    // Validación previa
    if (!order.id || !order.items || order.items.length === 0) {
        console.error("❌ Error: Datos de orden incompletos", order);
        toast({ variant: 'destructive', title: 'Error de datos', description: 'La orden está incompleta.' });
        return;
    }

    setIsUpdating(true);
    
    try {
        // ⚠️ LIMPIEZA DE ITEMS (Igual que en Checkout)
        const cleanItems = order.items.map((item: any) => {
            const rawPrice = item.price || item.unit_price || item.unitPrice || item.product?.price || 0;
            const price = Number(rawPrice);
            
            return {
                id: item.id,
                title: item.name || item.title || item.product?.name || 'Producto',
                price: isNaN(price) ? 0 : price,
                quantity: Number(item.quantity || 1)
            };
        });

        if (cleanItems.some((i: any) => i.price <= 0)) {
             throw new Error("El precio de los productos no es válido (0). Contacta a soporte.");
        }

        const response = await authedFetch('/api/checkout', appUser, {
            orderId: order.id,
            items: cleanItems,
            userId: appUser?.uid,
            storeId: order.storeId,
            storeOwnerId: null,
            payerEmail: appUser?.email
        });

        const data = await response.json();

        if (response.ok && data.url) {
            toast({ title: "Redirigiendo a MercadoPago..." });
            window.location.href = data.url;
        } else {
            console.error("❌ Respuesta Error API:", data);
            throw new Error(data.error || "No se recibió URL de pago");
        }

    } catch(error: any) {
        console.error("❌ Error Catch:", error);
        toast({ 
            variant: 'destructive', 
            title: 'Error de conexión', 
            description: error.message || 'No se pudo iniciar el pago.' 
        });
        setIsUpdating(false);
    }
  }

  // --- DIAGNÓSTICO PARA TIENDAS ---
  if (userProfile?.role === 'store' && !isStoreOwner) {
      return (
          <CardFooter className="bg-warning/10 border-t border-warning/30 p-4">
              <div className="flex flex-col gap-2 text-sm text-foreground w-full">
                  <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Modo Diagnóstico: Permisos</span>
                  </div>
                  <p>No ves los controles porque no eres el dueño de esta tienda.</p>
              </div>
          </CardFooter>
      )
  }

  // --- VISTA REPARTIDOR ---
  // Este componente ya NO renderiza nada para el repartidor: su botón de "Confirmar
  // Entrega" acá DUPLICABA al del bloque "Tu Misión" de la página (que es el completo:
  // dirección + llamar + navegar + entregar con PIN) — David vio los dos botones en la
  // prueba del 19/8. Un solo camino de entrega: el de la página, vía
  // ConfirmDeliveryDialog + /api/orders/confirm-delivery.

  // --- ESCENARIO 1: CLIENTE ESPERANDO CONFIRMACIÓN ---
  if (isBuyer && order.status === 'Pendiente de Confirmación') {
      return (
        <>
          <CardFooter className="flex-col gap-4">
              <Alert className="bg-warning/10 border-warning/30">
                  <Clock className="h-4 w-4 text-warning" />
                  <AlertTitle className="text-foreground">Verificando disponibilidad</AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                     La tienda está revisando si tiene stock. Podrás pagar en cuanto confirmen.
                  </AlertDescription>
              </Alert>
              <div className="flex w-full gap-3">
                  <Button disabled variant="outline" className="flex-1 opacity-50 cursor-not-allowed">
                      Esperando a la tienda...
                  </Button>
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowCancelDialog(true)} disabled={isUpdating}>
                      <Ban className="mr-2 h-4 w-4" /> Cancelar
                  </Button>
              </div>
          </CardFooter>
          <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <AlertDialogContent>
                  <AlertDialogHeader>
                      <AlertDialogTitle>¿Cancelar el pedido?</AlertDialogTitle>
                      <AlertDialogDescription>
                          El pedido será cancelado y la tienda será notificada. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                      <AlertDialogCancel>Volver</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCancelOrder} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                          {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Sí, cancelar pedido
                      </AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
          </AlertDialog>
        </>
      );
  }

  // --- ESCENARIO 2: CLIENTE PAGA ---
  if (isBuyer && order.status === 'Pendiente de Pago') {
    return (
      <>
        <CardFooter className="flex-col gap-4">
          <Alert className="bg-success/10 border-success/30">
               <CheckCircle2 className="h-4 w-4 text-success" />
               <AlertTitle className="text-foreground">¡Stock Confirmado!</AlertTitle>
               <AlertDescription className="text-muted-foreground">
                  Tus productos están reservados. Realiza el pago para finalizar.
               </AlertDescription>
          </Alert>
          <Button onClick={handleBuyerPayment} disabled={isUpdating} className="w-full h-12 text-lg shadow-md">
              {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5" />}
              Pagar ${order.total.toFixed(2)} Ahora
          </Button>
          <p className="text-xs text-muted-foreground text-center">* Procesado seguro vía MercadoPago</p>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full" onClick={() => setShowCancelDialog(true)} disabled={isUpdating}>
              <Ban className="mr-2 h-3 w-3" /> Cancelar este pedido
          </Button>
        </CardFooter>
        <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar el pedido?</AlertDialogTitle>
                    <AlertDialogDescription>
                        El pedido aún no fue pagado. Será cancelado y la tienda será notificada.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Volver</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelOrder} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Sí, cancelar pedido
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // --- ESCENARIO 3: TIENDA CONFIRMA STOCK ---
  if (isStoreOwner && order.status === 'Pendiente de Confirmación') {
      return (
         <CardFooter className="flex-col items-start gap-4 pt-4 border-t bg-warning/5">
            <div className="flex items-center gap-2 w-full">
                <ShoppingBag className="text-warning h-5 w-5" />
                <span className="font-semibold text-foreground">Solicitud de Stock</span>
            </div>
            <CardDescription>
                Destildá los productos que no tengas, o bajá la cantidad con − si tenés
                menos de lo pedido. El cliente verá el total recalculado antes de pagar.
            </CardDescription>
            <div className="w-full space-y-1.5 bg-background/50 rounded-md border p-3">
                {order.items?.map((item) => {
                    const prepQty = qtyOverrides[item.id] ?? item.quantity;
                    const isAdjusted = !uncheckedIds.has(item.id) && prepQty < item.quantity;
                    return (
                    <label key={item.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                        <span className="flex items-center gap-2">
                            <Checkbox
                                checked={!uncheckedIds.has(item.id)}
                                onCheckedChange={() => toggleStockItem(item.id)}
                            />
                            <span className={uncheckedIds.has(item.id) ? 'line-through text-muted-foreground' : (isAdjusted ? 'text-warning' : '')}>
                                {isAdjusted ? `${prepQty} de ${item.quantity}` : `${item.quantity}x`} {item.name || (item as any).title || 'Producto'}
                            </span>
                            {item.quantity > 1 && !uncheckedIds.has(item.id) && (
                                <span className="flex items-center gap-1 shrink-0">
                                    <Button type="button" variant="outline" size="icon" className="h-5 w-5 text-xs" disabled={prepQty <= 1} onClick={(e) => { e.preventDefault(); bumpQty(item.id, -1, item.quantity); }}>−</Button>
                                    <Button type="button" variant="outline" size="icon" className="h-5 w-5 text-xs" disabled={prepQty >= item.quantity} onClick={(e) => { e.preventDefault(); bumpQty(item.id, +1, item.quantity); }}>+</Button>
                                </span>
                            )}
                        </span>
                        <span className="text-muted-foreground">${(item.price * prepQty).toFixed(0)}</span>
                    </label>
                    );
                })}
            </div>
            <div className="flex w-full gap-3">
                 <Button
                    onClick={() => handleUpdateStatus('Rechazado')}
                    disabled={isUpdating}
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                 >
                    <XCircle className="mr-2 h-4 w-4" />
                    Sin Stock (todo)
                </Button>
                <Button
                    onClick={handleConfirmStock}
                    disabled={isUpdating || allItemsUnchecked}
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                    title={allItemsUnchecked ? 'Destildaste todos los productos -- usá "Sin Stock (todo)"' : undefined}
                >
                    {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {(uncheckedIds.size > 0 || adjustedCount > 0) ? 'Confirmar con cambios' : 'Tengo Stock'}
                </Button>
            </div>
        </CardFooter>
      )
  }

  // --- ESCENARIO 4: TIENDA ESPERANDO PAGO ---
  if (isStoreOwner && order.status === 'Pendiente de Pago') {
    return (
        <CardFooter className="flex-col items-start gap-4 pt-4 border-t">
            <Alert className="bg-info/10 border-info/30">
                 <CreditCard className="h-4 w-4 text-info" />
                 <AlertTitle className="text-foreground">Esperando Pago</AlertTitle>
                 <AlertDescription className="text-muted-foreground">
                    Has confirmado el stock. Esperando que el cliente complete el pago.
                 </AlertDescription>
            </Alert>
        </CardFooter>
    );
  }

  // --- VISTA TIENDA: ESPERANDO AL REPARTIDOR ---
  if (isStoreOwner && ['Listo para recoger', 'En camino', 'En reparto'].includes(order.status)) {
      return (
        <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-info/5">
            <Alert className="bg-info/10 border-info/30">
                <Clock className="h-4 w-4 text-info" />
                <AlertTitle className="text-foreground">
                    {order.status === 'Listo para recoger' ? 'Buscando repartidor' : order.status === 'En camino' ? 'Repartidor en camino a retirarlo' : 'En camino al cliente'}
                </AlertTitle>
                <AlertDescription className="text-muted-foreground">
                    {order.status === 'Listo para recoger'
                        ? 'Avisamos a los repartidores disponibles. En cuanto uno lo acepte, te avisamos.'
                        : 'El repartidor se encarga del resto — vos ya hiciste tu parte.'}
                </AlertDescription>
            </Alert>
        </CardFooter>
      );
  }

  // --- VISTA TIENDA: CONTROLES GENERALES ---
  if (isStoreOwner && possibleNextStatuses.length > 0) {
      return (
        <CardFooter className="flex-col items-start gap-4 pt-4 border-t">
            <CardDescription>Gestión del Pedido</CardDescription>
            <div className="flex w-full gap-2">
                <Select onValueChange={(value) => setSelectedStatus(value as OrderStatus)} value={selectedStatus}>
                    <SelectTrigger><SelectValue placeholder="Cambiar estado..." /></SelectTrigger>
                    <SelectContent>
                        {possibleNextStatuses.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button onClick={() => selectedStatus && handleUpdateStatus(selectedStatus)} disabled={!selectedStatus || isUpdating}>
                    Actualizar
                </Button>
            </div>
        </CardFooter>
      );
  }

  return null;
}