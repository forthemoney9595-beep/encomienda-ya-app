'use client';

import { useMemo } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, CollectionReference } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

export function Notifications() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();

  // 1. TIENDA: Pedidos que requieren atención (Confirmar o Preparar)
  const storeQuery = useMemoFirebase(() => {
    if (!firestore || userProfile?.role !== 'store' || !userProfile.storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', userProfile.storeId),
      // Ahora escuchamos DOS estados:
      // - Pendiente de Confirmación: El cliente acaba de pedir.
      // - En preparación: El cliente YA PAGÓ y la tienda debe cocinar.
      where('status', 'in', ['Pendiente de Confirmación', 'En preparación'])
    ) as CollectionReference<Order>;
  }, [firestore, userProfile?.role, userProfile?.storeId]);

  // 2. REPARTIDOR: Pedidos Listos para Recoger (En preparación y sin repartidor)
  const deliveryQuery = useMemoFirebase(() => {
    if (!firestore || userProfile?.role !== 'delivery' || !user) return null;
    return query(
      collection(firestore, 'orders'),
      where('status', '==', 'En preparación'),
      where('deliveryPersonId', '==', null)
    ) as CollectionReference<Order>;
  }, [firestore, userProfile?.role, user]);

  // 3. COMPRADOR: Pedidos que requieren Acción (Pagar) o Atención (En reparto)
  const buyerQuery = useMemoFirebase(() => {
    if (!firestore || userProfile?.role !== 'buyer' || !user) return null;
    return query(
      collection(firestore, 'orders'),
      where('userId', '==', user.uid),
      where('status', 'in', ['Pendiente de Pago', 'En reparto']) 
    ) as CollectionReference<Order>;
  }, [firestore, userProfile?.role, user]);

  // Hooks de colección
  const { data: storeNotifications, isLoading: storeLoading } = useCollection<Order>(storeQuery);
  const { data: deliveryNotifications, isLoading: deliveryLoading } = useCollection<Order>(deliveryQuery);
  const { data: buyerNotifications, isLoading: buyerLoading } = useCollection<Order>(buyerQuery);

  const notifications = useMemo(() => {
    // Notificaciones para TIENDA
    if (userProfile?.role === 'store' && storeNotifications) {
      return storeNotifications.map(order => {
        const isPaid = order.status === 'En preparación';
        return {
            id: order.id,
            // Mensaje dinámico: Nuevo vs Pagado
            message: isPaid 
                ? `¡Pago recibido! Preparar pedido de ${order.customerName}.` 
                : `Nuevo pedido de ${order.customerName}.`,
            href: `/orders/${order.id}`,
            type: isPaid ? 'cocina' : 'pedido',
            time: order.createdAt
        };
      });
    }
    
    // Notificaciones para REPARTIDOR
    if (userProfile?.role === 'delivery' && deliveryNotifications) {
      return deliveryNotifications.map(order => ({
        id: order.id,
        message: `¡Pedido listo en ${order.storeName}!`,
        href: `/orders/${order.id}`,
        type: 'recogida',
        time: order.createdAt
      }));
    }

    // Notificaciones para COMPRADOR (Cliente)
    if (userProfile?.role === 'buyer' && buyerNotifications) {
        return buyerNotifications.map(order => {
            const isPaymentPending = order.status === 'Pendiente de Pago';
            return {
                id: order.id,
                message: isPaymentPending 
                    ? `¡${order.storeName} aceptó tu pedido! Paga ahora.` 
                    : `Tu pedido de ${order.storeName} está en camino.`,
                href: `/orders/${order.id}`,
                type: isPaymentPending ? 'pago' : 'info',
                time: order.createdAt
            };
        });
    }

    return [];
  }, [userProfile?.role, storeNotifications, deliveryNotifications, buyerNotifications]);

  const notificationCount = notifications.length;
  const isLoading = storeLoading || deliveryLoading || buyerLoading || authLoading;

  if (isLoading) {
    return <Skeleton className="h-9 w-9 rounded-full" />;
  }
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
              {notificationCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 mr-4" align="end">
        <div className="p-3 border-b bg-muted/30">
            <h4 className="font-semibold text-sm">Notificaciones ({notificationCount})</h4>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                  No tienes notificaciones nuevas.
              </div>
          ) : (
              notifications.map((notif) => (
                <Link key={notif.id} href={notif.href} className="block p-3 hover:bg-muted/50 border-b last:border-b-0 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-medium leading-tight">{notif.message}</p>
                      {/* Indicadores visuales de tipo de notificación */}
                      {notif.type === 'pago' && <span className="h-2 w-2 rounded-full bg-orange-500 mt-1" />}
                      {notif.type === 'pedido' && <span className="h-2 w-2 rounded-full bg-blue-500 mt-1" />}
                      {notif.type === 'cocina' && <span className="h-2 w-2 rounded-full bg-green-500 mt-1" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {notif.type === 'pago' ? 'Requiere pago' : 
                     notif.type === 'cocina' ? 'Listo para preparar' : 
                     'Actualización'}
                  </p>
                </Link>
              ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}