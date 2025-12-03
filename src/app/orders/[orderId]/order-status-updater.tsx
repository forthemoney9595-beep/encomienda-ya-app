'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/firebase';
import type { Order, OrderStatus } from '@/lib/order-service';
import { updateOrderStatus } from '@/lib/order-service';
import { CardFooter, CardDescription, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2, XCircle, Clock, ShoppingBag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface OrderStatusUpdaterProps {
  order: Order;
}

// ✅ NUEVO FLUJO DE ESTADOS (Stock -> Pago -> Cocina)
const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  // 1. Tienda confirma stock -> Habilita pago
  'Pendiente de Confirmación': ['Pendiente de Pago', 'Rechazado'], 
  
  // 2. Cliente paga -> Pasa directo a cocina (automático tras pago)
  'Pendiente de Pago': ['En preparación'], 
  
  // 3. Flujo normal logístico
  'En preparación': ['En reparto'],
  'En reparto': ['Entregado'],
  'Entregado': [],
  'Cancelado': [],
  'Rechazado': [],
};

export function OrderStatusUpdater({ order }: OrderStatusUpdaterProps) {
  const { user: appUser, userProfile } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [isUpdating, setIsUpdating] = useState(false);

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

  // --- INTEGRACIÓN REAL MERCADOPAGO (FASE 2) ---
  const handleBuyerPayment = async () => {
    if (!order) return;
    
    setIsUpdating(true);
    
    try {
        // 1. Llamamos a NUESTRA API para generar la preferencia
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: order.id,
                items: order.items,
                payerEmail: appUser?.email // Enviamos el mail del usuario para pre-llenar en MP
            })
        });

        const data = await response.json();

        if (data.url) {
            toast({ title: "Redirigiendo a MercadoPago..." });
            // 2. Redirigimos al usuario a la pasarela de pago segura
            window.location.href = data.url;
        } else {
            console.error("Respuesta MP:", data);
            throw new Error("No se recibió URL de pago");
        }

    } catch(error) {
        console.error(error);
        toast({ 
            variant: 'destructive', 
            title: 'Error de conexión', 
            description: 'No se pudo iniciar el pago. Intenta nuevamente.' 
        });
        setIsUpdating(false); // Solo desbloqueamos si falló. Si redirige, dejamos cargando.
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

  // ========================================================================
  // 🔽 LOGICA DE NEGOCIO: STOCK -> PAGO 🔽
  // ========================================================================

  // --- ESCENARIO 1: CLIENTE ESPERANDO CONFIRMACIÓN DE STOCK ---
  if (isBuyer && order.status === 'Pendiente de Confirmación') {
      return (
        <CardFooter className="flex-col gap-4">
             <Alert className="bg-yellow-50 border-yellow-200">
                 <Clock className="h-4 w-4 text-yellow-600" />
                 <AlertTitle className="text-yellow-800">Verificando disponibilidad</AlertTitle>
                 <AlertDescription className="text-yellow-700">
                    La tienda está revisando si tiene stock de tus productos. Podrás pagar en cuanto confirmen.
                 </AlertDescription>
            </Alert>
            <Button disabled variant="outline" className="w-full opacity-50 cursor-not-allowed">
                 Esperando a la tienda...
            </Button>
        </CardFooter>
      );
  }

  // --- ESCENARIO 2: CLIENTE PAGA (Stock ya confirmado) ---
  if (isBuyer && order.status === 'Pendiente de Pago') {
    return (
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
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Procesado seguro vía MercadoPago
        </p>
      </CardFooter>
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

  // --- VISTA TIENDA: CONTROLES GENERALES (En preparación, etc) ---
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