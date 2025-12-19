'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  MapPin, 
  Navigation, 
  CheckCircle2, 
  DollarSign, 
  Truck, 
  CreditCard, 
  Wallet, 
  Clock, 
  Map as MapIcon, 
  PackageCheck 
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Definimos la interfaz localmente
interface Order {
  id: string;
  storeName: string;
  storeAddress?: string;
  customerName: string;
  shippingInfo?: { address: string };
  status: string;
  total: number;
  paymentMethod: string;
  deliveryFee: number;
  items: any[];
  createdAt: any;
  deliveryPersonId?: string;
  deliveryPayoutStatus?: 'pending' | 'paid';
  payoutDate?: any;
}

export default function DeliveryOrdersView() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter(); 
  const searchParams = useSearchParams();

  // 1. PESTAÑA ACTIVA
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'available');
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);

  // 2. QUERY: PEDIDOS DISPONIBLES (CORREGIDO PARA SINCRONIZACIÓN)
  const availableQuery = useMemo(() => {
     if (!firestore) return null;
     return query(
       collection(firestore, 'orders'), 
       // Que no tengan repartidor asignado
       where('deliveryPersonId', '==', null),
       // ✅ FIX CRÍTICO: Ampliamos la lista de estados para que no se pierda ninguno
       // Ahora escucha también "Aceptado" y "Listo para recoger"
       where('status', 'in', [
           'pending', 
           'Pendiente', 
           'Pendiente de Confirmación', 
           'En preparación', 
           'Aceptado', 
           'Listo para recoger'
       ]) 
     );
  }, [firestore]);

  const { data: availableOrders } = useCollection<Order>(availableQuery);

  // 3. QUERY: MIS PEDIDOS (Para En Curso y Billetera)
  const myOrdersQuery = useMemo(() => {
      if (!firestore || !user) return null;
      return query(
        collection(firestore, 'orders'),
        where('deliveryPersonId', '==', user.uid)
      );
  }, [firestore, user]);

  const { data: allMyOrders } = useCollection<Order>(myOrdersQuery);

  // 4. FILTROS EN MEMORIA
  const myActiveOrders = useMemo(() => {
      // Filtramos los que están activos en mi posesión
      return allMyOrders?.filter(o => ['En camino', 'En reparto', 'En preparación', 'Listo para recoger'].includes(o.status)) || [];
  }, [allMyOrders]);

  // 5. 💰 CÁLCULOS FINANCIEROS (BILLETERA)
  const financeStats = useMemo(() => {
    const emptyStats = { 
        pendingBalance: 0, 
        lastPayoutDate: null as Date | null, 
        totalPaid: 0, 
        unpaidOrders: [] as Order[] 
    };

    if (!allMyOrders) return emptyStats;

    // A. Saldo Pendiente: Entregados Y NO pagados
    const unpaidOrders = allMyOrders.filter(o => o.status === 'Entregado' && o.deliveryPayoutStatus !== 'paid');
    const pendingBalance = unpaidOrders.reduce((acc, order) => acc + (Number(order.deliveryFee) || 0), 0);

    // B. Historial de Pagos
    const paidOrders = allMyOrders.filter(o => o.deliveryPayoutStatus === 'paid');
    const totalPaid = paidOrders.reduce((acc, order) => acc + (Number(order.deliveryFee) || 0), 0);
    
    let lastPayoutDate: Date | null = null;
    if (paidOrders.length > 0) {
        const sortedPaid = [...paidOrders].sort((a, b) => {
           const dateA = a.payoutDate?.seconds || a.createdAt?.seconds || 0;
           const dateB = b.payoutDate?.seconds || b.createdAt?.seconds || 0;
           return dateB - dateA;
        });
        const lastOrder = sortedPaid[0];
        lastPayoutDate = lastOrder.payoutDate ? lastOrder.payoutDate.toDate() : (lastOrder.createdAt?.toDate ? lastOrder.createdAt.toDate() : new Date());
    }

    return { pendingBalance, lastPayoutDate, totalPaid, unpaidOrders };
  }, [allMyOrders]);

  // --- ACCIONES DEL PROCESO ---

  // A. TOMAR PEDIDO -> Pasa a 'En camino'
  const handleTakeOrder = async (orderId: string) => {
    if (!user || !firestore) return;
    try {
      const orderRef = doc(firestore, 'orders', orderId);
      await updateDoc(orderRef, {
        deliveryPersonId: user.uid,
        deliveryPersonName: userProfile?.name || user.displayName || 'Repartidor',
        status: 'En camino', 
        takenAt: serverTimestamp()
      });
      toast({ title: "¡Pedido Asignado!", description: "Ve a la tienda a retirarlo." });
      setActiveTab('active');
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo tomar el pedido." });
    }
  };

  // B. CONFIRMAR RETIRO -> Pasa a 'En reparto'
  const handlePickupOrder = async (orderId: string) => {
    if (!firestore) return;
    try {
        const orderRef = doc(firestore, 'orders', orderId);
        await updateDoc(orderRef, {
            status: 'En reparto',
            pickedUpAt: serverTimestamp()
        });
        toast({ title: "¡Pedido Retirado!", description: "Inicia la ruta hacia el cliente." });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar." });
    }
  };

  const handleFinishDeliveryClick = (order: Order) => {
    setConfirmDeliveryOrder(order);
  };

  // C. FINALIZAR -> Pasa a 'Entregado'
  const confirmFinishDelivery = async () => {
    if (!confirmDeliveryOrder || !firestore) return;
    try {
      const orderRef = doc(firestore, 'orders', confirmDeliveryOrder.id);
      await updateDoc(orderRef, {
        status: 'Entregado',
        deliveredAt: serverTimestamp()
      });
      toast({ title: "¡Entrega Completada!", description: "Ganancia registrada en tu Billetera." });
      setConfirmDeliveryOrder(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo finalizar." });
    }
  };

  // NAVEGACIÓN AL DETALLE (GPS/CHAT)
  const goToDetails = (orderId: string) => {
      router.push(`/orders/${orderId}`);
  };

  return (
    <div className="container mx-auto pb-24">
      
      <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Panel de Repartidor</h2>
          <Badge variant="outline" className="hidden sm:flex">Zona Activa</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="available">
            Disponibles ({availableOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="active">
            En Curso ({myActiveOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="wallet" className="text-orange-700 font-semibold data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800">
             <Wallet className="h-4 w-4 mr-2"/> Billetera
          </TabsTrigger>
        </TabsList>

        {/* --- PESTAÑA: PEDIDOS DISPONIBLES --- */}
        <TabsContent value="available" className="space-y-4">
          {availableOrders?.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-xl border-2 border-dashed">
                <Truck className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="text-lg font-medium">No hay pedidos disponibles</h3>
                <p className="text-sm text-muted-foreground">Mantente atento a nuevas alertas.</p>
            </div>
          ) : (
            availableOrders?.map(order => (
              <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow border-l-4 border-l-primary">
                <CardHeader className="pb-3 bg-muted/10">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                            {order.storeName}
                        </CardTitle>
                        <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs font-normal flex items-center gap-1">
                                {order.paymentMethod === 'Efectivo' ? <Wallet className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                                {order.paymentMethod === 'mercadopago' ? 'MercadoPago' : order.paymentMethod}
                            </Badge>
                        </div>
                    </div>
                    <Badge className="bg-green-600 hover:bg-green-700">
                        +${order.deliveryFee}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="py-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground">Retirar en:</p>
                            <p className="text-sm">{order.storeAddress || 'Dirección de tienda'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Navigation className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground">Entregar a:</p>
                            <p className="text-sm">{order.shippingInfo?.address}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button className="w-full" size="lg" onClick={() => handleTakeOrder(order.id)}>
                        Tomar Pedido
                    </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </TabsContent>

        {/* --- PESTAÑA: PEDIDOS EN CURSO --- */}
        <TabsContent value="active" className="space-y-4">
            {myActiveOrders?.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-3" />
                    <h3 className="text-lg font-medium">Estás libre</h3>
                    <p className="text-sm text-muted-foreground">Ve a la pestaña "Disponibles" para tomar un viaje.</p>
                </div>
            ) : (
                myActiveOrders?.map(order => (
                    <Card key={order.id} className={`border-l-4 shadow-md ${order.paymentMethod === 'Efectivo' ? 'border-l-yellow-500 ring-2 ring-yellow-500/20' : 'border-l-blue-500'}`}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <Badge variant="secondary" className="animate-pulse bg-blue-100 text-blue-700 uppercase">
                                        {order.status}
                                    </Badge>
                                    <CardTitle className="mt-1 text-lg">{order.storeName}</CardTitle>
                                </div>
                                <div className="text-right">
                                    <span className="font-bold text-lg block">${order.total}</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pb-2 space-y-4">
                            
                            {/* Mensajes de Estado */}
                            {(order.status === 'En camino' || order.status === 'Aceptado' || order.status === 'Listo para recoger') && (
                                <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm flex items-center gap-2 border border-blue-100">
                                    <MapPin className="h-4 w-4"/> 
                                    <strong>Paso 1:</strong> Dirígete a la tienda para retirar.
                                </div>
                            )}
                            {order.status === 'En reparto' && (
                                <div className="p-3 bg-orange-50 text-orange-800 rounded-lg text-sm flex items-center gap-2 border border-orange-100">
                                    <Navigation className="h-4 w-4"/> 
                                    <strong>Paso 2:</strong> Estás llevando el pedido al cliente.
                                </div>
                            )}

                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1">
                                <p className="text-xs text-muted-foreground uppercase font-bold">Destino Final:</p>
                                <p className="text-sm font-medium">{order.shippingInfo?.address}</p>
                                <p className="text-xs text-muted-foreground">Cliente: {order.customerName}</p>
                            </div>
                            
                            {/* ALERTA DE COBRO EN EFECTIVO */}
                            {order.paymentMethod === 'Efectivo' && order.status === 'En reparto' && (
                                <div className="p-4 bg-yellow-50 rounded-lg border-2 border-yellow-400 flex items-start gap-3 animate-in fade-in zoom-in">
                                    <div className="bg-yellow-100 p-2 rounded-full">
                                        <DollarSign className="h-6 w-6 text-yellow-700" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-yellow-900 uppercase text-sm">¡COBRAR AL CLIENTE!</p>
                                        <p className="text-sm text-yellow-800 font-medium">
                                            Debes recibir <span className="text-lg font-bold">${order.total}</span> en efectivo.
                                        </p>
                                    </div>
                                </div>
                            )}

                             {/* AVISO DE PAGO ONLINE */}
                             {order.paymentMethod === 'mercadopago' && (
                                <div className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    <p className="text-sm text-green-800 font-medium">
                                        Pedido pagado online. <strong>Solo entregar.</strong>
                                    </p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            {/* ✅ BOTÓN DE NAVEGACIÓN */}
                            <Button variant="secondary" className="w-full h-10 border-blue-200 text-blue-700 hover:bg-blue-100" onClick={() => goToDetails(order.id)}>
                                <MapIcon className="mr-2 h-4 w-4" /> Ver Detalles / Mapa / Chat
                            </Button>

                            {/* ✅ BOTONES DE FLUJO */}
                            {(order.status === 'En camino' || order.status === 'Aceptado' || order.status === 'Listo para recoger') ? (
                                <Button className="w-full h-12 bg-blue-600 hover:bg-blue-700" onClick={() => handlePickupOrder(order.id)}>
                                    <PackageCheck className="mr-2 h-5 w-5" /> Ya retiré el pedido
                                </Button>
                            ) : (
                                <Button className={`w-full text-lg h-12 ${order.paymentMethod === 'Efectivo' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-green-600 hover:bg-green-700'}`} onClick={() => handleFinishDeliveryClick(order)}>
                                    <CheckCircle2 className="mr-2 h-5 w-5" /> 
                                    {order.paymentMethod === 'Efectivo' ? 'Ya cobré y Entregué' : 'Confirmar Entrega'}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                ))
            )}
        </TabsContent>

        {/* --- PESTAÑA: BILLETERA --- */}
        <TabsContent value="wallet" className="space-y-6 animate-in slide-in-from-right-4 duration-500">
             <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-l-4 border-l-orange-600 shadow-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Clock className="h-4 w-4" /> Saldo Pendiente de Cobro
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-orange-700">${financeStats.pendingBalance.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ganancias por envíos entregados (no pagados).
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-600 shadow-sm bg-green-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" /> Último Pago Recibido
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {financeStats.lastPayoutDate ? (
                            <>
                                <div className="text-xl font-bold text-green-800">
                                    {format(financeStats.lastPayoutDate, "d 'de' MMMM", { locale: es })}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Total histórico ganado: <strong>${financeStats.totalPaid.toLocaleString()}</strong>
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-muted-foreground italic">Aún no has recibido pagos.</div>
                        )}
                    </CardContent>
                </Card>
             </div>

             <Card>
                <CardHeader>
                    <CardTitle>Historial Reciente</CardTitle>
                    <CardDescription>Detalle de tus ganancias por entrega.</CardDescription>
                </CardHeader>
                <CardContent>
                    {financeStats.unpaidOrders.length === 0 && financeStats.totalPaid === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Wallet className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                            <p>No tienes movimientos aún.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {financeStats.unpaidOrders.map((order: any) => (
                                <div key={order.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                                    <div>
                                        <p className="font-medium text-sm">Pedido #{order.id.substring(0,6)}</p>
                                        <Badge variant="outline" className="text-[10px] border-orange-200 text-orange-700">Pendiente</Badge>
                                    </div>
                                    <div className="font-bold text-orange-600">
                                        +${(order.deliveryFee || 0).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
             </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmDeliveryOrder} onOpenChange={(open) => !open && setConfirmDeliveryOrder(null)}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Confirmar Entrega</DialogTitle>
                <DialogDescription>
                    ¿Entregaste el pedido a {confirmDeliveryOrder?.customerName}?
                </DialogDescription>
            </DialogHeader>

            {confirmDeliveryOrder?.paymentMethod === 'Efectivo' && (
                <div className="bg-yellow-100 p-4 rounded-lg border border-yellow-400 text-center my-2">
                    <p className="font-bold text-yellow-900 uppercase">¡COBRAR AL CLIENTE!</p>
                    <h3 className="font-black text-2xl text-yellow-900">${confirmDeliveryOrder.total}</h3>
                </div>
            )}

            <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDeliveryOrder(null)}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={confirmFinishDelivery}>
                    Sí, Entregado
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}