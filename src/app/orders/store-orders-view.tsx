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
import { Clock, CheckCircle2, Megaphone, Utensils, CreditCard, Bike, Eye } from 'lucide-react'; // ✅ Agregamos Eye
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link'; // ✅ Importamos Link

export default function StoreOrdersView() {
  const { userProfile } = useAuth();
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

  // --- FUNCIÓN DE BROADCAST (Difusión a repartidores) ---
  const notifyAllDrivers = async (orderId: string, storeName: string) => {
      if (!firestore) return;
      try {
          const driversQuery = query(collection(firestore, 'users'), where('role', '==', 'delivery'));
          const driversSnap = await getDocs(driversQuery);
          
          if (driversSnap.empty) {
              toast({ variant: "destructive", title: "No hay repartidores", description: "No se encontraron repartidores registrados en la zona." });
              return;
          }

          const batch = writeBatch(firestore);
          
          driversSnap.forEach(driverDoc => {
              const notifRef = doc(collection(firestore, 'notifications'));
              batch.set(notifRef, {
                  userId: driverDoc.id,
                  title: "📦 Nuevo Pedido Disponible",
                  body: `La tienda ${storeName} tiene un pedido listo. ¡Aceptalo rápido!`,
                  type: "delivery_request",
                  orderId: orderId,
                  read: false,
                  createdAt: serverTimestamp(),
                  icon: "alert"
              });
          });

          await batch.commit();
          toast({ title: "📢 Alerta Masiva Enviada", description: `Se notificó a ${driversSnap.size} repartidores.` });

      } catch (e) {
          console.error("Error en broadcast:", e);
          toast({ variant: "destructive", title: "Error al notificar" });
      }
  };

  const handleConfirmStock = async (order: any) => {
      if (!firestore) return;
      try {
          await updateDoc(doc(firestore, 'orders', order.id), { status: 'Pendiente de Pago' });
          
          const msg = "La tienda ha confirmado el stock. ¡Puedes proceder al pago!";
          await OrderService.sendNotification(firestore, order.userId, "✅ Stock Confirmado", msg, "order_status", order.id);
          
          toast({ title: "Stock Confirmado", description: "El cliente ha sido notificado para pagar." });
      } catch (error) {
          toast({ variant: "destructive", title: "Error al confirmar stock" });
      }
  };

  const handleRejectOrder = async (order: any) => {
      if (!firestore) return;
      if(!confirm("¿Estás seguro de rechazar este pedido?")) return;
      try {
          await updateDoc(doc(firestore, 'orders', order.id), { status: 'Rechazado' });
          await OrderService.sendNotification(firestore, order.userId, "Pedido Rechazado", "La tienda no puede tomar tu pedido.", "order_status", order.id);
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
                order.id
            );
            toast({ title: "Repartidor avisado", description: "Se notificó al conductor asignado." });
        } else {
            // BROADCAST
            await notifyAllDrivers(order.id, userProfile?.displayName || 'Tienda');
        }
      } catch (e) { console.error(e); }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Clock className="mx-auto h-8 w-8 animate-spin mb-2"/>Cargando pedidos...</div>;

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Gestión de Pedidos" description="Administra los pedidos entrantes." />

      <Tabs defaultValue="active" className="w-full">
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
                        onAction={() => handleConfirmStock(order)}
                        onReject={() => handleRejectOrder(order)} 
                        actionLabel="Confirmar Stock"
                        actionIcon={CheckCircle2}
                        statusColor="border-l-orange-500"
                        statusLabel="Solicitud Nueva"
                        statusBadgeColor="bg-orange-100 text-orange-800 border-orange-200"
                    />
                ))
            )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
            {activeOrders.map(order => {
                let action = null;
                let label = "";
                let icon = null;
                let isDisabled = false;
                let badgeColor = "bg-blue-100 text-blue-800 border-blue-200"; 

                if (order.status === 'Pendiente de Pago') {
                    label = "Esperando Pago del Cliente...";
                    icon = Clock;
                    isDisabled = true;
                    badgeColor = "bg-yellow-100 text-yellow-800 border-yellow-200";
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
                    badgeColor = "bg-orange-100 text-orange-800 border-orange-200"; 
                } else if (order.status === 'En reparto') {
                    label = "En camino con Repartidor";
                    icon = Bike;
                    isDisabled = true;
                    badgeColor = "bg-blue-100 text-blue-800 border-blue-200";
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

        <TabsContent value="history" className="space-y-4">
            {historyOrders.map(order => (
                <OrderCard 
                    key={order.id} 
                    order={order} 
                    isDisabled={true} 
                    statusColor="border-l-gray-400"
                    statusLabel={order.status}
                    statusBadgeColor="bg-gray-100 text-gray-800 border-gray-200"
                />
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ✅ COMPONENTE TARJETA MEJORADO (Con botón de Navegación)
function OrderCard({ order, onAction, onReject, actionLabel, actionIcon: Icon, isDisabled, statusColor, statusLabel, statusBadgeColor }: any) {
    return (
        <Card className={`border-l-4 ${statusColor} shadow-sm overflow-hidden`}>
            <CardHeader className="bg-muted/10 pb-3 pt-3">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">Pedido #{order.id.substring(0, 6)}</CardTitle>
                            <Badge className={`${statusBadgeColor || 'bg-gray-100 text-gray-800'} border px-2 py-0.5 font-medium`}>
                                {statusLabel || order.status}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(order.createdAt?.toDate ? order.createdAt.toDate() : new Date(), "d MMM, HH:mm", { locale: es })}
                        </p>
                    </div>
                    
                    {order.paymentStatus === 'paid' && (
                         <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
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
                            <span className="font-medium text-gray-700">{item.quantity}x {item.title || item.name}</span>
                            <span className="text-gray-500">${(item.price * item.quantity).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                
                {order.readyForPickup && order.status === 'En preparación' && (
                    <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-100">
                        <Megaphone className="h-3 w-3 animate-pulse" />
                        <span>Buscando repartidor... (Alerta enviada)</span>
                    </div>
                )}
            </CardContent>
            
            {/* ✅ FOOTER SIEMPRE VISIBLE PARA NAVEGACIÓN */}
            <CardFooter className="bg-gray-50/50 flex flex-wrap gap-2 justify-end border-t p-3">
                
                {/* 1. Botón Universal: Ver Detalles / Chat */}
                <Link href={`/orders/${order.id}`} className="flex-1 sm:flex-none">
                    <Button variant="secondary" size="sm" className="w-full bg-white border border-gray-200 hover:bg-gray-100 text-gray-700">
                        <Eye className="mr-2 h-4 w-4" /> Ver Detalles / Chat
                    </Button>
                </Link>

                {/* 2. Botón Rechazar */}
                {onReject && (
                    <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200 flex-1 sm:flex-none" onClick={onReject}>
                        Rechazar
                    </Button>
                )}
                
                {/* 3. Botón Acción Principal (Confirmar / Llamar Delivery) */}
                {onAction && actionLabel && (
                    <Button 
                        size="sm" 
                        className={`${isDisabled ? 'bg-muted text-muted-foreground opacity-80' : 'bg-green-600 hover:bg-green-700 text-white shadow-sm'} flex-1 sm:flex-none`} 
                        onClick={onAction}
                        disabled={isDisabled && !actionLabel.includes("Reenviar")} 
                    >
                        {Icon && <Icon className="mr-2 h-4 w-4" />}
                        {actionLabel}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}