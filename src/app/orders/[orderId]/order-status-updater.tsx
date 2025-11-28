'use client';

import { useRouter } from 'next/navigation';
// ✅ CORRECCIÓN CLAVE: Importamos useAuth desde el contexto, NO desde firebase
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/firebase';
import type { Order, OrderStatus } from '@/lib/order-service';
import { updateOrderStatus } from '@/lib/order-service';
import { CardFooter, CardDescription, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, CreditCard, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface OrderStatusUpdaterProps {
  order: Order;
}

const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  'Pendiente de Confirmación': ['Pendiente de Pago', 'Rechazado'],
  'Pendiente de Pago': [],
  'En preparación': [],
  'En reparto': [],
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
          title: '¡Estado Actualizado!',
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

  // --- MODO DEBUG: Si eres tienda pero no ves botones, esto te dirá por qué ---
  // Ahora que useAuth está bien importado, este bloque SÍ funcionará si hay error de IDs
  if (userProfile?.role === 'store' && !isStoreOwner) {
      return (
          <CardFooter className="bg-yellow-50 border-t border-yellow-200 p-4">
              <div className="flex flex-col gap-2 text-sm text-yellow-800 w-full">
                  <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Modo Diagnóstico: Permisos</span>
                  </div>
                  <p>No ves los botones porque los IDs no coinciden:</p>
                  <ul className="list-disc list-inside font-mono text-xs bg-yellow-100 p-2 rounded">
                      <li><strong>Tu ID de Tienda (Perfil):</strong> {userProfile.storeId || 'No definido'}</li>
                      <li><strong>ID Tienda del Pedido:</strong> {order.storeId}</li>
                  </ul>
                  <p className="text-xs mt-2">
                      *Solución:* Edita tu usuario en Firebase para que el `storeId` coincida, o crea un pedido nuevo.
                  </p>
              </div>
          </CardFooter>
      )
  }
  // ---------------------------------------------------------------------------

  if (isDeliveryPerson && order.status === 'En reparto' && order.deliveryPersonId === appUser?.uid) {
     return (
       <CardFooter>
            <Button onClick={() => handleUpdateStatus('Entregado')} disabled={isUpdating} className="w-full">
                {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Marcar como Entregado
            </Button>
       </CardFooter>
     );
  }

  const handleBuyerPayment = async () => {
    if (!firestore) return;
    setIsUpdating(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    try {
        await updateOrderStatus(firestore, order.id, 'En preparación');
        toast({ title: '¡Pago Realizado!', description: 'Pedido en preparación.' });
        router.refresh();
    } catch(error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Error al procesar pago.' });
    } finally {
        setIsUpdating(false);
    }
  }

  if (isBuyer && order.status === 'Pendiente de Pago') {
    return (
      <CardFooter>
        <Card className="w-full bg-primary/10 border-primary/40">
            <CardFooter className="flex-col items-start gap-4 p-4">
                <AlertTitle>¡Tu pedido fue confirmado!</AlertTitle>
                <AlertDescription>Realiza el pago para continuar.</AlertDescription>
                <Button onClick={handleBuyerPayment} disabled={isUpdating} className="w-full">
                    {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagar Ahora (${order.total.toFixed(2)})
                </Button>
            </CardFooter>
        </Card>
      </CardFooter>
    );
  }

  if (isStoreOwner && possibleNextStatuses.length > 0) {
      if (order.status === 'Pendiente de Confirmación') {
          return (
             <CardFooter className="flex-col items-start gap-4 pt-4">
                <CardDescription>Confirma disponibilidad para recibir pago.</CardDescription>
                <div className="flex w-full gap-2">
                     <Button onClick={() => handleUpdateStatus('Rechazado')} disabled={isUpdating} variant="destructive" className="w-full">
                        Rechazar
                    </Button>
                    <Button onClick={() => handleUpdateStatus('Pendiente de Pago')} disabled={isUpdating} className="w-full">
                        {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirmar Pedido
                    </Button>
                </div>
            </CardFooter>
          )
      }
      return (
        <CardFooter className="flex-col items-start gap-4 pt-4">
            <CardDescription>Como dueño de la tienda, puedes actualizar el estado del pedido.</CardDescription>
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