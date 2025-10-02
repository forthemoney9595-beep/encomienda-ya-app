
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import type { Order, OrderStatus } from '@/lib/order-service';
import { updateOrderStatus } from '@/lib/order-service';
import { CardFooter, CardDescription, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface OrderStatusUpdaterProps {
  order: Order;
}

const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  'Pendiente de Confirmación': ['Pendiente de Pago', 'Rechazado'],
  'Pendiente de Pago': [], // Action is for buyer, not a status change by store/delivery
  'En preparación': [], // Action is for delivery person to accept, not store to change
  'En reparto': [], // Action is for delivery person to complete, not store to change
  'Entregado': [],
  'Cancelado': [],
  'Rechazado': [],
  'Pedido Realizado': [], 
};

export function OrderStatusUpdater({ order }: OrderStatusUpdaterProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { updatePrototypeOrder } = usePrototypeData();

  const isStoreOwner = user?.storeId === order.storeId;
  const isBuyer = user?.uid === order.userId;
  const isDeliveryPerson = user?.role === 'delivery';

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    setIsUpdating(true);
    try {
      if (order.id.startsWith('proto-')) {
        updatePrototypeOrder(order.id, { status: newStatus });
      } else {
        await updateOrderStatus(order.id, newStatus);
      }

      toast({
          title: '¡Estado Actualizado!',
          description: `El pedido ahora está "${newStatus}".`,
      });
      router.refresh();
    } catch (error) {
        console.error('Error updating order status:', error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo actualizar el estado del pedido.',
        });
    } finally {
        setIsUpdating(false);
        setSelectedStatus('');
    }
  };

  // Specific logic for delivery person
  if (isDeliveryPerson && order.status === 'En reparto' && order.deliveryPersonId === user?.uid) {
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
    setIsUpdating(true);
    // Simulating payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        const newStatus = 'En preparación';
        if (order.id.startsWith('proto-')) {
            updatePrototypeOrder(order.id, { status: newStatus });
        } else {
            await updateOrderStatus(order.id, newStatus);
        }
        toast({
            title: '¡Pago Realizado!',
            description: 'La tienda ha sido notificada para que comience a preparar tu pedido.',
        });
        router.refresh();

    } catch(error) {
        console.error("Error processing payment:", error);
        toast({ variant: 'destructive', title: 'Error de Pago', description: 'No se pudo procesar el pago.' });
    } finally {
        setIsUpdating(false);
    }
  }

  // View for the buyer when payment is pending
  if (isBuyer && order.status === 'Pendiente de Pago') {
    return (
      <CardFooter>
        <Card className="w-full bg-primary/10 border-primary/40">
            <CardFooter className="flex-col items-start gap-4 p-4">
                <AlertTitle>¡Tu pedido fue confirmado!</AlertTitle>
                <AlertDescription>La tienda ha confirmado la disponibilidad. Realiza el pago para continuar.</AlertDescription>
                <Button onClick={handleBuyerPayment} disabled={isUpdating} className="w-full">
                    {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagar Ahora ($${order.total.toFixed(2)})
                </Button>
            </CardFooter>
        </Card>
      </CardFooter>
    );
  }

  // View for the store owner
  if (isStoreOwner && possibleNextStatuses.length > 0) {
      if (order.status === 'Pendiente de Confirmación') {
          return (
             <CardFooter className="flex-col items-start gap-4 pt-4">
                <CardDescription>Confirma la disponibilidad de los productos para que el cliente pueda pagar.</CardDescription>
                <div className="flex w-full gap-2">
                     <Button onClick={() => handleUpdateStatus('Rechazado')} disabled={isUpdating} variant="destructive" className="w-full">
                        {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                    <SelectTrigger>
                        <SelectValue placeholder="Seleccionar nuevo estado..." />
                    </SelectTrigger>
                    <SelectContent>
                        {possibleNextStatuses.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button onClick={() => selectedStatus && handleUpdateStatus(selectedStatus)} disabled={!selectedStatus || isUpdating}>
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Actualizar
                </Button>
            </div>
        </CardFooter>
      );
  }

  return null; // Return null if not the right user or no actions are possible
}

    
