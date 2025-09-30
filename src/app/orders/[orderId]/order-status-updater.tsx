'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import type { Order, OrderStatus } from '@/lib/order-service';
import { updateOrderStatus } from '@/lib/order-service';
import { CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface OrderStatusUpdaterProps {
  order: Order;
}

const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  'Pedido Realizado': ['En preparación', 'Cancelado'],
  'En preparación': ['En reparto', 'Cancelado'],
  'En reparto': ['Entregado'],
  'Entregado': [],
  'Cancelado': [],
};

export function OrderStatusUpdater({ order }: OrderStatusUpdaterProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const isStoreOwner = user?.storeId === order.storeId;
  const possibleNextStatuses = statusTransitions[order.status];

  if (authLoading || !isStoreOwner || !possibleNextStatuses || possibleNextStatuses.length === 0) {
    return null; // Don't show anything if not the owner, or no next statuses are possible
  }
  
  const handleUpdateStatus = async () => {
    if (!selectedStatus) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Por favor, selecciona un nuevo estado.',
        });
        return;
    }
    
    setIsUpdating(true);
    try {
        await updateOrderStatus(order.id, selectedStatus);
        toast({
            title: '¡Estado Actualizado!',
            description: `El pedido ahora está "${selectedStatus}".`,
        });
        router.push('/orders'); // Redirect back to the orders list
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
            <Button onClick={handleUpdateStatus} disabled={!selectedStatus || isUpdating}>
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar
            </Button>
        </div>
    </CardFooter>
  );
}
