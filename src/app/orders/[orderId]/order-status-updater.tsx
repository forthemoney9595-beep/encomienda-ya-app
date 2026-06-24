'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import type { Order, OrderStatus } from '@/lib/order-service';
import { updateOrderStatus } from '@/lib/order-service';
import { CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2, XCircle, Clock, ShoppingBag, Ban } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface OrderStatusUpdaterProps {
  order: Order;
}

const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  'pending': [],
  'Pendiente': [],
  'Pendiente de Confirmación': ['Pendiente de Pago', 'Rechazado'],
  'Pendiente de Pago': ['En preparación'],
  'Aceptado': ['En preparación'],
  'En preparación': ['Listo para recoger', 'En reparto'],
  'Listo para recoger': ['En camino', 'En reparto'],
  'En camino': ['En reparto'],
  'En reparto': ['Entregado'],
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
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, userId: appUser.uid }),
      });
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
  const isDeliveryPerson = userProfile?.role === 'delivery';

  const possibleNextStatuses = statusTransitions[order.status] || [];

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!firestore) return;
    setIsUpdating(true);
    try {
      await updateOrderStatus(firestore, order.id, newStatus);
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

        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: order.id,
                items: cleanItems, 
                userId: appUser?.uid, 
                storeId: order.storeId, 
                storeOwnerId: null, 
                payerEmail: appUser?.email 
            })
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
          <CardFooter className="bg-yellow-50 border-t border-yellow-200 p-4">
              <div className="flex flex-col gap-2 text-sm text-yellow-800 w-full">
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
  if (isDeliveryPerson && order.status === 'En reparto' && order.deliveryPersonId === appUser?.uid) {
     return (
       <CardFooter>
            <Button onClick={() => handleUpdateStatus('Entregado')} disabled={isUpdating} className="w-full h-12 text-lg bg-green-600 hover:bg-green-700">
                {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                Confirmar Entrega
            </Button>
       </CardFooter>
     );
  }

  // --- ESCENARIO 1: CLIENTE ESPERANDO CONFIRMACIÓN ---
  if (isBuyer && order.status === 'Pendiente de Confirmación') {
      return (
        <>
          <CardFooter className="flex-col gap-4">
              <Alert className="bg-yellow-50 border-yellow-200">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <AlertTitle className="text-yellow-800">Verificando disponibilidad</AlertTitle>
                  <AlertDescription className="text-yellow-700">
                     La tienda está revisando si tiene stock. Podrás pagar en cuanto confirmen.
                  </AlertDescription>
              </Alert>
              <div className="flex w-full gap-3">
                  <Button disabled variant="outline" className="flex-1 opacity-50 cursor-not-allowed">
                      Esperando a la tienda...
                  </Button>
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowCancelDialog(true)} disabled={isUpdating}>
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
                      <AlertDialogAction onClick={handleCancelOrder} className="bg-red-600 hover:bg-red-700">
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
          <Alert className="bg-green-50 border-green-200">
               <CheckCircle2 className="h-4 w-4 text-green-600" />
               <AlertTitle className="text-green-800">¡Stock Confirmado!</AlertTitle>
               <AlertDescription className="text-green-700">
                  Tus productos están reservados. Realiza el pago para finalizar.
               </AlertDescription>
          </Alert>
          <Button onClick={handleBuyerPayment} disabled={isUpdating} className="w-full h-12 text-lg shadow-md bg-blue-600 hover:bg-blue-700 text-white">
              {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5" />}
              Pagar ${order.total.toFixed(2)} Ahora
          </Button>
          <p className="text-xs text-muted-foreground text-center">* Procesado seguro vía MercadoPago</p>
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full" onClick={() => setShowCancelDialog(true)} disabled={isUpdating}>
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
                    <AlertDialogAction onClick={handleCancelOrder} className="bg-red-600 hover:bg-red-700">
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
         <CardFooter className="flex-col items-start gap-4 pt-4 border-t bg-orange-50/30">
            <div className="flex items-center gap-2 w-full">
                <ShoppingBag className="text-orange-600 h-5 w-5" />
                <span className="font-semibold text-orange-800">Solicitud de Stock</span>
            </div>
            <CardDescription>
                Revisa si tienes los productos. Si aceptas, el cliente podrá pagar.
            </CardDescription>
            <div className="flex w-full gap-3">
                 <Button 
                    onClick={() => handleUpdateStatus('Rechazado')} 
                    disabled={isUpdating} 
                    variant="outline" 
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                 >
                    <XCircle className="mr-2 h-4 w-4" />
                    Sin Stock
                </Button>
                <Button 
                    onClick={() => handleUpdateStatus('Pendiente de Pago')} 
                    disabled={isUpdating} 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                >
                    {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Tengo Stock
                </Button>
            </div>
        </CardFooter>
      )
  }

  // --- ESCENARIO 4: TIENDA ESPERANDO PAGO ---
  if (isStoreOwner && order.status === 'Pendiente de Pago') {
    return (
        <CardFooter className="flex-col items-start gap-4 pt-4 border-t">
            <Alert className="bg-blue-50 border-blue-200">
                 <CreditCard className="h-4 w-4 text-blue-600" />
                 <AlertTitle className="text-blue-800">Esperando Pago</AlertTitle>
                 <AlertDescription className="text-blue-700">
                    Has confirmado el stock. Esperando que el cliente complete el pago.
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