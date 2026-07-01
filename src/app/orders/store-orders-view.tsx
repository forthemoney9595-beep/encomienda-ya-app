'use client';

import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { OrderService } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { Clock, CheckCircle2, Megaphone, Utensils, CreditCard, Bike, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Dos tonos cortos generados con la Web Audio API -- sin archivo de audio que mantener.
function playNewOrderBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Navegador sin soporte / sin gesto previo del usuario -- silencioso, no rompe nada.
  }
}

export default function StoreOrdersView() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', userProfile.storeId)
    );
  }, [firestore, userProfile?.storeId]);

  const { data: allOrders, isLoading } = useCollection<any>(ordersQuery);

  const sortedOrders = (allOrders || []).sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
  });

  const pendingOrders = sortedOrders.filter(o => o.status === 'Pendiente de Confirmación');
  const activeOrders = sortedOrders.filter(o => ['Pendiente de Pago', 'En preparación', 'En reparto', 'En camino'].includes(o.status));
  const historyOrders = sortedOrders.filter(o => ['Entregado', 'Cancelado', 'Rechazado'].includes(o.status));

  // Alerta sonora de pedido nuevo: solo para ids que aparecen DESPUÉS del primer render
  // (la primera carga siembra el set sin sonar, para no pitar pedidos viejos al entrar).
  const seenOrderIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = pendingOrders.map(o => o.id);
    if (seenOrderIdsRef.current === null) {
      seenOrderIdsRef.current = new Set(currentIds);
      return;
    }
    const hasNew = currentIds.some(id => !seenOrderIdsRef.current!.has(id));
    if (hasNew) playNewOrderBeep();
    seenOrderIdsRef.current = new Set(currentIds);
  }, [pendingOrders]);

  // --- FUNCIÓN DE BROADCAST (Difusión a repartidores) ---
  // Va por API (no por Firestore directo) porque las reglas no le permiten a
  // una tienda leer la lista completa de usuarios/repartidores.
  const notifyAllDrivers = async (orderId: string) => {
      try {
          const res = await authedFetch('/api/orders/notify-drivers', user, { orderId });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al notificar');

          if (data.notified > 0) {
              toast({ title: "📢 Alerta Masiva Enviada", description: `Se notificó a ${data.notified} repartidores.` });
          } else {
              toast({ variant: "destructive", title: "No hay repartidores", description: "No se encontraron repartidores registrados." });
          }
      } catch (e) {
          console.error("Error en broadcast:", e);
          toast({ variant: "destructive", title: "Error al notificar" });
      }
  };

  const handleConfirmStock = async (order: any, removedItemIds: string[] = []) => {
      try {
          const res = await authedFetch('/api/orders/confirm-stock', user, { orderId: order.id, storeId: userProfile?.storeId, removedItemIds });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'No se pudo confirmar el pedido.');

          toast({
              title: removedItemIds.length > 0 ? 'Stock parcial confirmado' : 'Stock Confirmado',
              description: removedItemIds.length > 0
                  ? `Se sacaron ${removedItemIds.length} producto(s). El cliente ya tiene el nuevo total.`
                  : 'El cliente ha sido notificado para pagar.',
          });
      } catch (error: any) {
          toast({ variant: "destructive", title: "Error al confirmar stock", description: error.message });
      }
  };

  const handleRejectOrder = async (order: any) => {
      if (!firestore) return;
      if(!confirm("¿Estás seguro de rechazar este pedido?")) return;
      try {
          await updateDoc(doc(firestore, 'orders', order.id), { status: 'Rechazado' });
          await OrderService.sendNotification(firestore, order.userId, "Pedido Rechazado", "La tienda no puede tomar tu pedido.", "order_status", order.id, user);
          toast({ title: "Pedido Rechazado" });
      } catch (error) { toast({ variant: "destructive", title: "Error" }); }
  };

  // ✅ AVISAR REPARTIDOR
  const handleNotifyDriver = async (order: any) => {
      if (!firestore) return;
      try {
        await updateDoc(doc(firestore, 'orders', order.id), { 
            readyForPickup: true,
            lastDriverNotification: serverTimestamp()
        });
        
        if (order.deliveryPersonId) {
            await OrderService.sendNotification(
                firestore,
                order.deliveryPersonId,
                "🔔 Pedido Listo",
                "El pedido ya está listo para retirar en mostrador.",
                "delivery",
                order.id,
                user
            );
            toast({ title: "Repartidor avisado", description: "Se notificó al conductor asignado." });
        } else {
            // BROADCAST
            await notifyAllDrivers(order.id);
        }
      } catch (e) {
          console.error(e);
          toast({ variant: "destructive", title: "Error al avisar al repartidor" });
      }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Clock className="mx-auto h-8 w-8 animate-spin mb-2"/>Cargando pedidos...</div>;

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Gestión de Pedidos" description="Administra los pedidos entrantes." />

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="pending" className="relative">
             Nuevos
             {pendingOrders.length > 0 && <span className="ml-2 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">{pendingOrders.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="active">En Curso ({activeOrders.length})</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        {/* PESTAÑA PENDIENTES */}
        <TabsContent value="pending" className="space-y-4">
            {pendingOrders.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20">
                    <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium text-muted-foreground">No hay solicitudes pendientes</h3>
                    <p className="text-sm text-muted-foreground">Los nuevos pedidos aparecerán aquí para verificar stock.</p>
                </div>
            ) : (
                pendingOrders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onAction={(removedItemIds: string[]) => handleConfirmStock(order, removedItemIds)}
                        onReject={() => handleRejectOrder(order)}
                        actionLabel="Confirmar Stock"
                        actionIcon={CheckCircle2}
                        statusColor="border-l-warning"
                        statusLabel="Solicitud Nueva"
                        statusBadgeColor="bg-warning/15 text-warning border-warning/30"
                        selectable
                    />
                ))
            )}
        </TabsContent>

        {/* PESTAÑA EN CURSO */}
        <TabsContent value="active" className="space-y-4">
            {activeOrders.map(order => {
                let action = null;
                let label = "";
                let icon = null;
                let isDisabled = false;
                let badgeColor = "bg-info/15 text-info border-info/30";

                if (order.status === 'Pendiente de Pago') {
                    label = "Esperando Pago del Cliente...";
                    icon = Clock;
                    isDisabled = true;
                    badgeColor = "bg-warning/15 text-warning border-warning/30";
                } else if (order.status === 'En preparación') {
                    action = () => handleNotifyDriver(order);
                    
                    if (order.readyForPickup) {
                        label = "📢 Reenviar Alerta a Repartidores"; 
                        icon = Megaphone;
                        isDisabled = false; 
                    } else {
                        label = "✅ ¡Pedido Listo! Llamar Repartidor";
                        icon = Utensils;
                        isDisabled = false;
                    }
                    badgeColor = "bg-warning/15 text-warning border-warning/30";
                } else if (order.status === 'En reparto') {
                    label = "En camino con Repartidor";
                    icon = Bike;
                    isDisabled = true;
                    badgeColor = "bg-info/15 text-info border-info/30";
                }

                return (
                    <OrderCard 
                        key={order.id} 
                        order={order} 
                        onAction={action} 
                        actionLabel={label}
                        actionIcon={icon}
                        isDisabled={isDisabled}
                        statusColor="border-l-info"
                        statusLabel={order.status}
                        statusBadgeColor={badgeColor}
                    />
                );
            })}
             {activeOrders.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    <p>No hay pedidos activos en este momento.</p>
                </div>
            )}
        </TabsContent>

        {/* PESTAÑA HISTORIAL */}
        <TabsContent value="history" className="space-y-4">
            {historyOrders.map(order => (
                <OrderCard 
                    key={order.id} 
                    order={order} 
                    isDisabled={true} 
                    statusColor="border-l-border"
                    statusLabel={order.status}
                    statusBadgeColor="bg-muted text-muted-foreground border-border"
                />
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ✅ COMPONENTE TARJETA MEJORADO (Con botón de Navegación)
function OrderCard({ order, onAction, onReject, actionLabel, actionIcon: Icon, isDisabled, statusColor, statusLabel, statusBadgeColor, selectable }: any) {
    // Solo relevante en "Nuevos": permite destildar ítems sin stock antes de confirmar,
    // en vez del todo-o-nada de antes (confirmar todo o rechazar todo el pedido).
    const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set());
    const toggleItem = (itemId: string) => {
        setUncheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
            return next;
        });
    };
    const allUnchecked = selectable && order.items?.length > 0 && uncheckedIds.size === order.items.length;

    return (
        <Card className={`border-l-4 ${statusColor} shadow-sm overflow-hidden`}>
            <CardHeader className="bg-muted/10 pb-3 pt-3">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">Pedido #{order.id.substring(0, 6)}</CardTitle>
                            <Badge className={`${statusBadgeColor || 'bg-muted text-muted-foreground'} border px-2 py-0.5 font-medium`}>
                                {statusLabel || order.status}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(order.createdAt?.toDate ? order.createdAt.toDate() : new Date(), "d MMM, HH:mm", { locale: es })}
                        </p>
                    </div>
                    
                    {order.paymentStatus === 'paid' && (
                         <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                            <CreditCard className="h-3 w-3 mr-1" /> Pagado
                         </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="py-4 space-y-3">
                <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Cliente: <span className="text-muted-foreground">{order.customerName}</span></p>
                    <p className="font-bold text-base text-success">${order.total.toLocaleString()}</p>
                </div>
                
                <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2 border">
                    {order.items?.map((item: any, i: number) => (
                        <div key={item.id || i} className="flex justify-between items-start gap-2">
                            <span className="font-medium text-foreground flex items-center gap-2">
                                {selectable && (
                                    <Checkbox
                                        checked={!uncheckedIds.has(item.id)}
                                        onCheckedChange={() => toggleItem(item.id)}
                                    />
                                )}
                                <span className={uncheckedIds.has(item.id) ? 'line-through text-muted-foreground' : ''}>
                                    {item.quantity}x {item.title || item.name}
                                </span>
                            </span>
                            <span className="text-muted-foreground">${(item.price * item.quantity).toLocaleString()}</span>
                        </div>
                    ))}
                    {selectable && uncheckedIds.size > 0 && (
                        <p className="text-xs text-warning pt-1">Vas a confirmar sin {uncheckedIds.size} producto(s) tildado(s) arriba.</p>
                    )}
                </div>
                
                {order.readyForPickup && order.status === 'En preparación' && (
                    <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 p-2 rounded border border-warning/30">
                        <Megaphone className="h-3 w-3 animate-pulse" />
                        <span>Buscando repartidor... (Alerta enviada)</span>
                    </div>
                )}
            </CardContent>
            
            {/* ✅ FOOTER SIEMPRE VISIBLE PARA NAVEGACIÓN */}
            <CardFooter className="bg-muted/20 flex flex-wrap gap-2 justify-end border-t p-3">

                {/* 1. Botón Universal: Ver Detalles / Chat */}
                <Link href={`/orders/${order.id}`} className="flex-1 sm:flex-none">
                    <Button variant="secondary" size="sm" className="w-full">
                        <Eye className="mr-2 h-4 w-4" /> Ver Detalles / Chat
                    </Button>
                </Link>

                {/* 2. Botón Rechazar */}
                {onReject && (
                    <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 border-destructive/30 flex-1 sm:flex-none" onClick={onReject}>
                        Rechazar
                    </Button>
                )}

                {/* 3. Botón Acción Principal (Confirmar / Llamar Delivery) */}
                {onAction && actionLabel && (
                    <Button
                        size="sm"
                        className={`${(isDisabled || allUnchecked) ? 'bg-muted text-muted-foreground opacity-80' : 'bg-success hover:bg-success/90 text-success-foreground shadow-sm'} flex-1 sm:flex-none`}
                        onClick={() => onAction(Array.from(uncheckedIds))}
                        disabled={(isDisabled && !actionLabel.includes("Reenviar")) || allUnchecked}
                        title={allUnchecked ? 'Destildaste todos los productos -- rechazá el pedido en su lugar' : undefined}
                    >
                        {Icon && <Icon className="mr-2 h-4 w-4" />}
                        {selectable && uncheckedIds.size > 0 ? 'Confirmar con cambios' : actionLabel}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}