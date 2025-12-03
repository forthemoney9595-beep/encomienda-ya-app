'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection } from '@/lib/firebase';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
// ✅ CORRECCIÓN: Agregado 'Truck' a las importaciones
import { MapPin, Package, Clock, Navigation, CheckCircle2, DollarSign, AlertTriangle, Truck, CreditCard, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Definimos la interfaz localmente o importamos de order-service
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
}

export default function DeliveryDashboardPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('available');
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);

  // 1. Seguridad: Solo repartidores
  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // 2. Query: Pedidos Disponibles (Sin repartidor asignado)
  const availableQuery = query(
    collection(firestore || null as any, 'orders'), 
    where('deliveryPersonId', '==', null),
    where('status', 'in', ['Pendiente', 'Pendiente de Confirmación', 'En preparación']) 
  );

  const { data: availableOrders } = useCollection<Order>(firestore ? availableQuery : null);

  // 3. Query: Mis Pedidos Activos (Asignados a mí y no entregados)
  const myActiveQuery = user ? query(
    collection(firestore, 'orders'),
    where('deliveryPersonId', '==', user.uid),
    where('status', 'in', ['En camino', 'En reparto', 'En preparación'])
  ) : null;

  const { data: myOrders } = useCollection<Order>(myActiveQuery);

  // ACCIÓN: Tomar Pedido
  const handleTakeOrder = async (orderId: string) => {
    if (!user || !firestore) return;
    try {
      const orderRef = doc(firestore, 'orders', orderId);
      await updateDoc(orderRef, {
        deliveryPersonId: user.uid,
        deliveryPersonName: userProfile?.name || user.displayName || 'Repartidor',
        status: 'En reparto', 
        takenAt: serverTimestamp()
      });
      toast({ title: "¡Pedido Asignado!", description: "Dirígete a la tienda a retirar el pedido." });
      setActiveTab('active');
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo tomar el pedido." });
    }
  };

  // ACCIÓN: Finalizar Entrega (Abre Modal)
  const handleFinishDeliveryClick = (order: Order) => {
    setConfirmDeliveryOrder(order);
  };

  // ACCIÓN: Confirmar Entrega (En base de datos)
  const confirmFinishDelivery = async () => {
    if (!confirmDeliveryOrder || !firestore) return;
    try {
      const orderRef = doc(firestore, 'orders', confirmDeliveryOrder.id);
      await updateDoc(orderRef, {
        status: 'Entregado',
        deliveredAt: serverTimestamp()
      });
      toast({ title: "¡Entrega Completada!", description: "Buen trabajo. Ganancia registrada." });
      setConfirmDeliveryOrder(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo finalizar." });
    }
  };

  if (authLoading) return <div className="p-8 text-center">Cargando panel...</div>;

  return (
    <div className="container mx-auto pb-24 px-4 sm:px-6">
      <PageHeader 
        title="Panel de Repartidor" 
        description="Gestiona tus entregas y ganancias en tiempo real."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="available">
            Disponibles ({availableOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="active">
            En Curso ({myOrders?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* --- PESTAÑA: PEDIDOS DISPONIBLES --- */}
        <TabsContent value="available" className="space-y-4">
          {availableOrders?.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-xl border-2 border-dashed">
                <Truck className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="text-lg font-medium">No hay pedidos disponibles</h3>
                <p className="text-sm text-muted-foreground">Espera un momento o recarga la página.</p>
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
                                {order.paymentMethod}
                            </Badge>
                            <span className="text-xs text-muted-foreground self-center">
                                #{order.id.substring(0,6)} • {format(order.createdAt?.toDate() || new Date(), 'HH:mm')}
                            </span>
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
                            <p className="text-xs text-muted-foreground">{order.customerName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                        <Package className="h-4 w-4" />
                        {order.items?.length} ítems • Total pedido: ${order.total}
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
            {myOrders?.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-3" />
                    <h3 className="text-lg font-medium">Estás libre</h3>
                    <p className="text-sm text-muted-foreground">Ve a la pestaña "Disponibles" para tomar un viaje.</p>
                </div>
            ) : (
                myOrders?.map(order => (
                    <Card key={order.id} className={`border-l-4 shadow-md ${order.paymentMethod === 'Efectivo' ? 'border-l-yellow-500 ring-2 ring-yellow-500/20' : 'border-l-blue-500'}`}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <Badge variant="secondary" className="animate-pulse bg-blue-100 text-blue-700">
                                        EN CURSO
                                    </Badge>
                                    <CardTitle className="mt-1 text-lg">{order.storeName}</CardTitle>
                                </div>
                                <div className="text-right">
                                    <span className="font-bold text-lg block">${order.total}</span>
                                    <Badge variant="outline" className={`text-xs ${order.paymentMethod === 'Efectivo' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : ''}`}>
                                        {order.paymentMethod}
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pb-2 space-y-4">
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                                <p className="text-sm font-semibold flex items-center gap-2 text-blue-800">
                                    <Navigation className="h-4 w-4" /> Destino:
                                </p>
                                <p className="text-lg font-bold">{order.shippingInfo?.address}</p>
                                <p className="text-sm text-muted-foreground">Cliente: {order.customerName}</p>
                            </div>
                            
                            {/* ALERTA DE COBRO EN EFECTIVO */}
                            {order.paymentMethod === 'Efectivo' && (
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
                        </CardContent>
                        <CardFooter>
                            <Button className={`w-full text-lg h-12 ${order.paymentMethod === 'Efectivo' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-green-600 hover:bg-green-700'}`} onClick={() => handleFinishDeliveryClick(order)}>
                                <CheckCircle2 className="mr-2 h-5 w-5" /> 
                                {order.paymentMethod === 'Efectivo' ? 'Ya cobré y Entregué' : 'Confirmar Entrega'}
                            </Button>
                        </CardFooter>
                    </Card>
                ))
            )}
        </TabsContent>
      </Tabs>

      {/* --- MODAL DE CONFIRMACIÓN DE ENTREGA --- */}
      <Dialog open={!!confirmDeliveryOrder} onOpenChange={(open) => !open && setConfirmDeliveryOrder(null)}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Confirmar Entrega</DialogTitle>
                <DialogDescription>
                    ¿Estás seguro de que entregaste el pedido a {confirmDeliveryOrder?.customerName}?
                </DialogDescription>
            </DialogHeader>

            {confirmDeliveryOrder?.paymentMethod === 'Efectivo' && (
                <div className="bg-yellow-100 p-6 rounded-lg border-2 border-yellow-500 flex flex-col items-center text-center space-y-3 my-2">
                    <div className="bg-yellow-200 p-3 rounded-full">
                        <DollarSign className="h-10 w-10 text-yellow-800" />
                    </div>
                    <div>
                        <h3 className="font-black text-2xl text-yellow-900">${confirmDeliveryOrder.total}</h3>
                        <p className="font-bold text-yellow-800 uppercase">A cobrar en efectivo</p>
                    </div>
                    <p className="text-sm text-yellow-800">
                        No entregues el pedido hasta recibir el pago.
                    </p>
                </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setConfirmDeliveryOrder(null)}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700 w-full sm:w-auto" onClick={confirmFinishDelivery}>
                    Sí, Entregado
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}