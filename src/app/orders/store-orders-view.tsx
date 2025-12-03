'use client';

import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { OrderService } from '@/lib/order-service';
import { Clock, CheckCircle2, DollarSign, BellRing, Megaphone, Utensils, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function StoreOrdersView() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Query: Pedidos de MI tienda
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', userProfile.storeId)
    );
  }, [firestore, userProfile?.storeId]);

  const { data: allOrders, isLoading } = useCollection<any>(ordersQuery);

  // Ordenar en cliente para asegurar el orden correcto
  const sortedOrders = (allOrders || []).sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
  });

  // ESTADO 1: PENDIENTES DE CONFIRMACIÓN (Stock)
  const pendingOrders = sortedOrders.filter(o => o.status === 'Pendiente de Confirmación');
  
  // ESTADO 2: ACTIVOS (Ya pagados, en cocina o reparto) + Pendiente de Pago (Esperando al cliente)
  const activeOrders = sortedOrders.filter(o => ['Pendiente de Pago', 'En preparación', 'En reparto', 'En camino'].includes(o.status));
  
  // ESTADO 3: HISTORIAL
  const historyOrders = sortedOrders.filter(o => ['Entregado', 'Cancelado', 'Rechazado'].includes(o.status));

  // --- FUNCIÓN DE BROADCAST (Difusión a repartidores) ---
  const notifyAllDrivers = async (orderId: string, storeName: string) => {
      if (!firestore) return;
      try {
          const driversQuery = query(collection(firestore, 'users'), where('role', '==', 'delivery'));
          const driversSnap = await getDocs(driversQuery);
          
          if (driversSnap.empty) return;

          const batch = writeBatch(firestore);
          
          driversSnap.forEach(driverDoc => {
              const notifRef = doc(collection(firestore, 'notifications'));
              batch.set(notifRef, {
                  userId: driverDoc.id,
                  title: "📦 Nuevo Pedido Disponible",
                  message: `La tienda ${storeName} tiene un pedido listo. ¡Aceptalo rápido!`,
                  type: "delivery",
                  orderId: orderId,
                  read: false,
                  createdAt: serverTimestamp(),
                  icon: "alert"
              });
          });

          await batch.commit();
      } catch (e) {
          console.error("Error en broadcast:", e);
      }
  };

  // ✅ CONFIRMAR STOCK (Paso 1 -> Paso 2)
  const handleConfirmStock = async (order: any) => {
      if (!firestore) return;
      try {
          // Cambiamos estado a 'Pendiente de Pago' para que el cliente pueda pagar
          await updateDoc(doc(firestore, 'orders', order.id), { status: 'Pendiente de Pago' });
          
          const msg = "La tienda ha confirmado el stock. ¡Puedes proceder al pago!";

          // Notificar Cliente
          await OrderService.sendNotification(firestore, order.userId, "✅ Stock Confirmado", msg, "order_status", order.id);
          
          toast({ title: "Stock Confirmado", description: "El cliente ha sido notificado para pagar." });
      } catch (error) {
          toast({ variant: "destructive", title: "Error al confirmar stock" });
      }
  };

  // ✅ COMENZAR PREPARACIÓN (Paso 2 -> Paso 3, esto ocurre AUTOMÁTICAMENTE tras el pago, pero dejamos botón manual por seguridad)
  // Nota: Idealmente, el Webhook de MercadoPago hace esto. Pero si falla, la tienda puede forzarlo.
  const handleStartCooking = async (order: any) => {
      if (!firestore) return;
      try {
           await updateDoc(doc(firestore, 'orders', order.id), { status: 'En preparación' });
           // Aquí podríamos notificar a repartidores si queremos que lleguen mientras se cocina
           // Pero según tu flujo, se les avisa cuando está LISTO ("readyForPickup")
           toast({ title: "En preparación", description: "Comienza a cocinar." });
      } catch (error) {
           toast({ variant: "destructive", title: "Error" });
      }
  }

  const handleRejectOrder = async (order: any) => {
      if (!firestore) return;
      if(!confirm("¿Estás seguro de rechazar este pedido?")) return;
      try {
          await updateDoc(doc(firestore, 'orders', order.id), { status: 'Rechazado' });
          await OrderService.sendNotification(firestore, order.userId, "Pedido Rechazado", "La tienda no puede tomar tu pedido.", "order_status", order.id);
          toast({ title: "Pedido Rechazado" });
      } catch (error) { toast({ variant: "destructive", title: "Error" }); }
  };

  // ✅ AVISAR REPARTIDOR (Cuando la comida está lista)
  const handleNotifyDriver = async (order: any) => {
      if (!firestore) return;
      try {
        await updateDoc(doc(firestore, 'orders', order.id), { readyForPickup: true });
        
        if (order.deliveryPersonId) {
            // Si YA tiene dueño (raro en este modelo broadcast, pero posible), le avisamos
            await OrderService.sendNotification(
                firestore, 
                order.deliveryPersonId, 
                "🔔 Pedido Listo", 
                "El pedido ya está listo para retirar en mostrador.", 
                "delivery", 
                order.id
            );
            toast({ title: "Repartidor avisado", description: "Se notificó al conductor asignado." });
        } else {
            // BROADCAST: Avisar a TODOS los repartidores disponibles
            await notifyAllDrivers(order.id, userProfile?.displayName || 'Tienda');
            toast({ title: "Alerta Masiva Enviada", description: "Se avisó a todos los repartidores disponibles." });
        }
      } catch (e) { console.error(e); }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Clock className="mx-auto h-8 w-8 animate-spin mb-2"/>Cargando pedidos...</div>;

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Gestión de Pedidos" description="Administra los pedidos entrantes." />

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="pending" className="relative">
             Nuevos
             {pendingOrders.length > 0 && <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingOrders.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="active">En Curso ({activeOrders.length})</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

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
                        // En la pestaña "Pendientes", la acción principal es Confirmar Stock
                        onAction={() => handleConfirmStock(order)}
                        onReject={() => handleRejectOrder(order)} 
                        actionLabel="Confirmar Stock"
                        actionIcon={CheckCircle2}
                        statusColor="border-l-orange-500"
                    />
                ))
            )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
            {activeOrders.map(order => {
                // Lógica dinámica de botones según el estado
                let action = null;
                let label = "";
                let icon = null;
                let isDisabled = false;

                if (order.status === 'Pendiente de Pago') {
                    // Esperando al cliente
                    label = "Esperando Pago...";
                    icon = Clock;
                    isDisabled = true;
                } else if (order.status === 'En preparación') {
                    // Cocinando -> Avisar Repartidor
                    action = () => handleNotifyDriver(order);
                    label = order.readyForPickup ? "Repartidores Avisados" : "¡Listo! Llamar Repartidor";
                    icon = order.readyForPickup ? CheckCircle2 : Megaphone;
                    isDisabled = !!order.readyForPickup;
                }

                return (
                    <OrderCard 
                        key={order.id} 
                        order={order} 
                        onAction={action} 
                        actionLabel={label}
                        actionIcon={icon}
                        isDisabled={isDisabled}
                        statusColor="border-l-blue-500"
                    />
                );
            })}
             {activeOrders.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    <p>No hay pedidos activos en este momento.</p>
                </div>
            )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
            {historyOrders.map(order => (
                <OrderCard 
                    key={order.id} 
                    order={order} 
                    isDisabled={true} // Historial solo lectura
                    statusColor="border-l-gray-400"
                />
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componente Reutilizable de Tarjeta
function OrderCard({ order, onAction, onReject, actionLabel, actionIcon: Icon, isDisabled, statusColor }: any) {
    return (
        <Card className={`border-l-4 ${statusColor} shadow-sm`}>
            <CardHeader className="bg-muted/10 pb-3 pt-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            Pedido #{order.id.substring(0, 6)}
                            <Badge variant="outline" className="text-xs font-normal bg-white">
                                {order.status}
                            </Badge>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            {format(order.createdAt?.toDate ? order.createdAt.toDate() : new Date(), "d MMM, HH:mm", { locale: es })}
                        </p>
                    </div>
                    {/* Indicador visual de pago */}
                    {order.status !== 'Pendiente de Pago' && order.status !== 'Pendiente de Confirmación' && order.status !== 'Rechazado' && (
                         <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                            <CreditCard className="h-3 w-3 mr-1" /> Pagado
                         </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="py-4 space-y-3">
                <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Cliente: <span className="text-muted-foreground">{order.customerName}</span></p>
                    <p className="font-bold text-base text-green-700">${order.total.toLocaleString()}</p>
                </div>
                
                <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2 border">
                    {order.items?.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-start">
                            <span className="font-medium text-gray-700">{item.quantity}x {item.name}</span>
                            <span className="text-gray-500">${(item.price * item.quantity).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
            
            {/* Footer de Acciones solo si hay acciones disponibles */}
            {(onAction || onReject) && (
                <CardFooter className="bg-gray-50/50 flex gap-2 justify-end border-t p-3">
                    {onReject && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200" onClick={onReject}>
                            Rechazar
                        </Button>
                    )}
                    
                    {onAction && actionLabel && (
                        <Button 
                            size="sm" 
                            className={`${isDisabled ? 'bg-muted text-muted-foreground' : 'bg-green-600 hover:bg-green-700 text-white'}`} 
                            onClick={onAction}
                            disabled={isDisabled}
                        >
                            {Icon && <Icon className="mr-2 h-4 w-4" />}
                            {actionLabel}
                        </Button>
                    )}
                </CardFooter>
            )}
        </Card>
    );
}