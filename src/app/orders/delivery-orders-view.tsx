'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { OrderService, MAX_ACTIVE_ORDERS } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { gmapsDirectionsUrl, distanceMeters, formatDistance, isValidCoords } from '@/lib/geo';
import { DeliveryOnlineToggle } from '@/components/delivery-online-toggle';
import { LocationTracker } from '@/components/location-tracker';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  PackageCheck,
  Loader2,
  XCircle,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RELEASE_REASONS = ['Se me rompió el vehículo', 'Emergencia personal', 'No pude ubicar la dirección'];
const PROBLEM_REASONS = ['El cliente no responde', 'Dirección incorrecta/inaccesible', 'El cliente rechazó el pedido'];

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
  userId: string;
  storeOwnerId?: string | null;
  storeId?: string;
  deliveryPersonId?: string;
  hasReportedProblem?: boolean;
  // Snapshot de coords guardado por /api/orders/create — alimenta el botón "Navegar"
  // y la distancia estimada del viaje (Fase RR).
  storeCoords?: { latitude: number; longitude: number } | null;
  customerCoords?: { latitude: number; longitude: number } | null;
}

export default function DeliveryOrdersView() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter(); 
  const searchParams = useSearchParams();

  // ¿El repartidor está aprobado por el admin? Solo isApproved habilita tomar pedidos de
  // verdad (es el único campo que lee isApprovedDriver() en firestore.rules) -- antes
  // también aceptaba status === 'Activo' como atajo, lo que hacía que el botón se viera
  // habilitado aunque isApproved siguiera en false y Firestore fuera a rechazar la
  // escritura igual (permission-denied silencioso). Ver Fase admin donde se corrigieron
  // los 3 caminos que podían dejar status y isApproved desincronizados.
  const isApprovedDriver = (userProfile as any)?.isApproved === true;

  // 1. PESTAÑA ACTIVA
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'available');
  // Tanda B: el ?tab= solo se respetaba en el PRIMER montaje — navegar a
  // /orders?tab=active desde otra página con el componente ya montado no cambiaba nada.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'available' || tab === 'active') setActiveTab(tab);
  }, [searchParams]);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);

  // Soltar pedido (antes de retirar) / Reportar problema (después de retirar) -- un
  // mismo diálogo para las dos, ver /api/orders/release y /api/orders/report-problem.
  const [incidentDialog, setIncidentDialog] = useState<{ order: Order; kind: 'release' | 'report' } | null>(null);
  const [incidentReason, setIncidentReason] = useState('');
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);

  // 2. QUERY: PEDIDOS DISPONIBLES
  // Solo los 2 estados en los que de verdad tiene sentido que un repartidor "tome" un
  // pedido (la tienda lo está preparando, o ya está listo para retirar). Tiene que
  // coincidir EXACTO con lo que permite la regla de lectura de Firestore (orders, más
  // abajo en firestore.rules) -- si se agregan más estados acá sin agregarlos también
  // ahí, Firestore rechaza la consulta COMPLETA (no la filtra), y la pestaña queda vacía
  // sin ningún error visible. No se incluyen "Pendiente de Confirmación"/"Pendiente de
  // Pago" a propósito: la tienda todavía no confirmó que tiene stock, no correspondería
  // que cualquier repartidor vea esos pedidos todavía.
  const availableQuery = useMemo(() => {
     if (!firestore) return null;
     return query(
       collection(firestore, 'orders'),
       // Que no tengan repartidor asignado
       where('deliveryPersonId', '==', null),
       where('status', 'in', ['En preparación', 'Listo para recoger'])
     );
  }, [firestore]);

  const { data: allAvailableOrders } = useCollection<Order>(availableQuery);
  // Un repartidor puede COMPRAR como cualquier vecino (decisión de producto, 18/8), pero
  // su propio pedido no aparece en su pool: tomarlo él mismo sería envío gratis de facto
  // y habilitaría auto-calificarse. La regla de Firestore también lo bloquea — esto es la
  // capa visual.
  const availableOrders = (allAvailableOrders || []).filter(o => o.userId !== user?.uid);

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

  // --- ACCIONES DEL PROCESO ---

  // A. TOMAR PEDIDO -> Pasa a 'En camino'
  const handleTakeOrder = async (order: Order) => {
    if (!user || !firestore) return;
    if ((order as any).userId === user.uid) {
      toast({ variant: 'destructive', title: 'Este pedido es tuyo', description: 'Tu propio pedido lo lleva otro repartidor.' });
      return;
    }
    if (!isApprovedDriver) {
      toast({
        variant: 'destructive',
        title: 'Cuenta pendiente de aprobación',
        description: 'Un administrador debe aprobar tu cuenta antes de que puedas tomar pedidos.',
      });
      return;
    }
    if (myActiveOrders.length >= MAX_ACTIVE_ORDERS) {
      toast({
        variant: 'destructive',
        title: 'Ya tenés el máximo de pedidos en curso',
        description: `Terminá alguno de tus ${MAX_ACTIVE_ORDERS} pedidos activos antes de tomar otro.`,
      });
      return;
    }
    try {
      const driverName = userProfile?.name || user.displayName || 'Un repartidor';
      const orderRef = doc(firestore, 'orders', order.id);
      await updateDoc(orderRef, {
        deliveryPersonId: user.uid,
        deliveryPersonName: driverName,
        status: 'En camino',
        takenAt: serverTimestamp()
      });
      toast({ title: "¡Pedido Asignado!", description: "Ve a la tienda a retirarlo." });
      setActiveTab('active');

      // Avisar a la tienda y al comprador — antes este flujo no avisaba a nadie
      const targetStoreUser = order.storeOwnerId || order.storeId;
      if (targetStoreUser) {
        OrderService.sendNotification(
          firestore, targetStoreUser, "🛵 Repartidor en camino",
          `${driverName} aceptó el pedido y va a retirarlo.`, "order_status", order.id, user
        ).catch(console.error);
      }
      if (order.userId) {
        OrderService.sendNotification(
          firestore, order.userId, "🛵 Repartidor Asignado",
          "Un repartidor está yendo a retirar tu pedido.", "order_status", order.id, user
        ).catch(console.error);
      }
    } catch (error: any) {
      console.error(error);
      // Si Firestore rechazó la escritura, lo más probable es que otro repartidor
      // ya haya tomado este pedido un instante antes (la regla de seguridad exige
      // que deliveryPersonId siga siendo null en el momento exacto de escribir).
      const isPermissionDenied = error?.code === 'permission-denied';
      toast({
        variant: "destructive",
        title: isPermissionDenied ? "Pedido ya tomado" : "Error",
        description: isPermissionDenied
          ? "Otro repartidor ya tomó este pedido justo antes que tú."
          : "No se pudo tomar el pedido.",
      });
    }
  };

  // B. CONFIRMAR RETIRO -> Pasa a 'En reparto'
  const handlePickupOrder = async (order: Order) => {
    if (!firestore) return;
    try {
        const orderRef = doc(firestore, 'orders', order.id);
        await updateDoc(orderRef, {
            status: 'En reparto',
            pickedUpAt: serverTimestamp()
        });
        toast({ title: "¡Pedido Retirado!", description: "Inicia la ruta hacia el cliente." });

        // A partir de acá arranca el mapa GPS para el comprador (location-tracker.tsx
        // ya escucha status === 'En reparto') — solo faltaba avisarle que ya salió.
        if (order.userId) {
          OrderService.sendNotification(
            firestore, order.userId, "🚀 ¡En Camino a tu casa!",
            "El repartidor ya tiene tu pedido y va hacia ti.", "order_status", order.id, user
          ).catch(console.error);
        }
        // La TIENDA también (Fase PP): antes nunca se enteraba de que su pedido salió
        // del local — el retiro era mudo para quien preparó el pedido.
        if ((order as any).storeOwnerId) {
          OrderService.sendNotification(
            firestore, (order as any).storeOwnerId, "📦 Pedido retirado",
            `El repartidor retiró el pedido de ${order.customerName || 'un cliente'} y va en camino.`, "order_status", order.id, user
          ).catch(console.error);
        }
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
        deliveredAt: serverTimestamp(),
        // La posición en vivo del repartidor no queda guardada en la orden (Fase RR).
        driverCoords: deleteField()
      });
      toast({ title: "¡Entrega Completada!", description: "Ganancia registrada en tu Billetera." });

      // Este es el flujo real de "marcar entregado" (a diferencia del updateDoc de
      // arriba, no pasa por OrderService.updateOrderStatus) -- sin esto el comprador
      // nunca se enteraba de que llegó su pedido ni se lo invitaba a calificar.
      if (confirmDeliveryOrder.userId) {
        OrderService.sendNotification(
          firestore, confirmDeliveryOrder.userId, "🏠 ¡Llegamos!",
          "Disfruta tu pedido. No olvides calificar.", "order_status", confirmDeliveryOrder.id, user
        ).catch(console.error);
      }
      // La TIENDA cierra su ciclo (Fase PP): antes nunca sabía si el pedido llegó.
      if ((confirmDeliveryOrder as any).storeOwnerId) {
        OrderService.sendNotification(
          firestore, (confirmDeliveryOrder as any).storeOwnerId, "✅ Pedido entregado",
          `El pedido de ${confirmDeliveryOrder.customerName || 'un cliente'} fue entregado con éxito.`, "order_status", confirmDeliveryOrder.id, user
        ).catch(console.error);
      }

      setConfirmDeliveryOrder(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo finalizar." });
    }
  };

  // NAVEGACIÓN AL DETALLE (GPS/CHAT)
  const goToDetails = (orderId: string) => {
      router.push(`/orders/${orderId}`);
  };

  // D. SOLTAR PEDIDO (antes de retirar) / REPORTAR PROBLEMA (después de retirar)
  const openIncidentDialog = (order: Order, kind: 'release' | 'report') => {
    setIncidentReason('');
    setIncidentDialog({ order, kind });
  };

  const submitIncident = async () => {
    if (!incidentDialog || !user || !incidentReason.trim()) return;
    setIsSubmittingIncident(true);
    try {
      const endpoint = incidentDialog.kind === 'release' ? '/api/orders/release' : '/api/orders/report-problem';
      const res = await authedFetch(endpoint, user, { orderId: incidentDialog.order.id, reason: incidentReason.trim() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo procesar.');
      toast({
        title: incidentDialog.kind === 'release' ? 'Pedido liberado' : 'Problema reportado',
        description: incidentDialog.kind === 'release'
          ? 'Avisamos a otros repartidores. Ya no es tu responsabilidad.'
          : 'El admin fue notificado y va a decidir cómo seguir.',
      });
      setIncidentDialog(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo procesar.' });
    } finally {
      setIsSubmittingIncident(false);
    }
  };

  // ✅ FUNCIÓN DE LIMPIEZA VISUAL (NUEVO)
  const cleanAddress = (rawAddress: string | undefined) => {
      if (!rawAddress) return 'Dirección de tienda';
      if (rawAddress.includes('Ubicación GPS') || rawAddress.includes('lat:') || rawAddress.includes('(-28.')) {
          return 'Ver ubicación en mapa'; // Texto amigable si es coordenada fea
      }
      return rawAddress;
  };

  return (
    <div className="container mx-auto pb-24">

      {/* Tracking GPS desde el PANEL (Fase RR bis): el tracker vivía solo en la página
          de detalle del pedido — pero el repartidor opera desde acá (tomar/retirar/
          entregar están en estas tarjetas), así que en la prueba real nunca se montó y
          el mapa del comprador no mostraba la moto. Uno por pedido activo; el componente
          se auto-apaga fuera de 'En camino'/'En reparto' y el toast está deduplicado. */}
      {myActiveOrders?.map(o => (
        <LocationTracker key={`tracker-${o.id}`} orderId={o.id} isDriver={true} status={o.status} />
      ))}

      <div className="flex items-center justify-between mb-6 gap-3">
          <h2 className="text-2xl font-bold tracking-tight">Panel de Repartidor</h2>
          <div className="flex items-center gap-3">
              <Badge variant="outline" className="hidden sm:flex">{isApprovedDriver ? 'Zona Activa' : 'Pendiente'}</Badge>
              {isApprovedDriver && <DeliveryOnlineToggle />}
          </div>
      </div>

      {!isApprovedDriver && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-warning">Tu cuenta está pendiente de aprobación</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Un administrador tiene que revisar y aprobar tus datos (vehículo y licencia) antes de que
              puedas tomar pedidos. Mientras tanto podés ver los pedidos disponibles, pero no aceptarlos.
              Asegurate de haber subido las 3 fotos de tu licencia en tu perfil.
            </p>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="available">
            Disponibles ({availableOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="active">
            En Curso ({myActiveOrders?.length || 0}/{MAX_ACTIVE_ORDERS})
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
                    <Badge className="bg-success text-success-foreground hover:bg-success/90">
                        +${order.deliveryFee}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="py-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-info shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground">Retirar en:</p>
                            {/* ✅ USAMOS LA FUNCIÓN DE LIMPIEZA */}
                            <p className="text-sm">{cleanAddress(order.storeAddress)}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Navigation className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground">Entregar a:</p>
                            <p className="text-sm">{order.shippingInfo?.address}</p>
                        </div>
                    </div>
                    {/* Distancia estimada del viaje (Fase RR) — ayuda a decidir si tomarlo.
                        Línea recta a propósito: sin servicio de routing, y en un pueblo en
                        grilla la aproximación alcanza para comparar pedidos entre sí. */}
                    {isValidCoords(order.storeCoords) && isValidCoords(order.customerCoords) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 pl-8">
                            <Truck className="h-3.5 w-3.5" />
                            ≈ {formatDistance(distanceMeters(order.storeCoords!, order.customerCoords!))} de la tienda al cliente (línea recta)
                        </p>
                    )}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <Button
                        className="w-full"
                        size="lg"
                        onClick={() => handleTakeOrder(order)}
                        disabled={!isApprovedDriver || myActiveOrders.length >= MAX_ACTIVE_ORDERS}
                    >
                        {!isApprovedDriver
                          ? 'Cuenta pendiente de aprobación'
                          : myActiveOrders.length >= MAX_ACTIVE_ORDERS
                          ? `Ya tenés ${MAX_ACTIVE_ORDERS} pedidos en curso`
                          : 'Tomar Pedido'}
                    </Button>
                    {/* Ver qué lleva el pedido ANTES de tomarlo (pedido de la prueba, 15/8):
                        el detalle solo existía en las tarjetas de "En Curso". */}
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => goToDetails(order.id)}>
                        <Eye className="mr-2 h-4 w-4" /> Ver detalle del pedido
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
                    <CheckCircle2 className="mx-auto h-12 w-12 text-success mb-3" />
                    <h3 className="text-lg font-medium">Estás libre</h3>
                    <p className="text-sm text-muted-foreground">Ve a la pestaña &quot;Disponibles&quot; para tomar un viaje.</p>
                </div>
            ) : (
                myActiveOrders?.map(order => (
                    <Card key={order.id} className={`border-l-4 shadow-md ${order.paymentMethod === 'Efectivo' ? 'border-l-warning ring-2 ring-warning/20' : 'border-l-info'}`}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <Badge variant="secondary" className="animate-pulse bg-info/15 text-info uppercase">
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
                                <div className="p-3 bg-info/10 text-foreground rounded-lg text-sm flex items-center gap-2 border border-info/30">
                                    <MapPin className="h-4 w-4 text-info"/>
                                    <strong>Paso 1:</strong> Dirígete a la tienda para retirar.
                                </div>
                            )}
                            {order.status === 'En reparto' && (
                                <div className="p-3 bg-primary/10 text-foreground rounded-lg text-sm flex items-center gap-2 border border-primary/30">
                                    <Navigation className="h-4 w-4 text-primary"/>
                                    <strong>Paso 2:</strong> Estás llevando el pedido al cliente.
                                </div>
                            )}

                            <div className="p-3 bg-muted/50 rounded-lg border space-y-1">
                                <p className="text-xs text-muted-foreground uppercase font-bold">Destino Final:</p>
                                <p className="text-sm font-medium">{order.shippingInfo?.address}</p>
                                <p className="text-xs text-muted-foreground">Cliente: {order.customerName}</p>
                            </div>
                            
                            {/* ALERTA DE COBRO EN EFECTIVO */}
                            {order.paymentMethod === 'Efectivo' && order.status === 'En reparto' && (
                                <div className="p-4 bg-warning/10 rounded-lg border-2 border-warning flex items-start gap-3 animate-in fade-in zoom-in">
                                    <div className="bg-warning/20 p-2 rounded-full">
                                        <DollarSign className="h-6 w-6 text-warning" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-warning uppercase text-sm">¡COBRAR AL CLIENTE!</p>
                                        <p className="text-sm text-foreground font-medium">
                                            Debes recibir <span className="text-lg font-bold">${order.total}</span> en efectivo.
                                        </p>
                                    </div>
                                </div>
                            )}

                             {/* AVISO DE PAGO ONLINE */}
                             {order.paymentMethod === 'mercadopago' && (
                                <div className="p-3 bg-success/10 rounded-lg border border-success/30 flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-success" />
                                    <p className="text-sm text-foreground font-medium">
                                        Pedido pagado online. <strong>Solo entregar.</strong>
                                    </p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            {/* NAVEGAR CON GOOGLE MAPS (Fase RR): deep link a la app de mapas del
                                teléfono — a la TIENDA mientras va a retirar, al CLIENTE una vez
                                retirado. Es como navegan los repartidores de Rappi/PedidosYa. */}
                            {(() => {
                                const goingToStore = order.status !== 'En reparto';
                                const dest = goingToStore ? order.storeCoords : order.customerCoords;
                                if (!isValidCoords(dest)) return null;
                                return (
                                    <Button asChild variant="outline" className="w-full h-11 border-info/40 text-info hover:bg-info/10 hover:text-info">
                                        <a href={gmapsDirectionsUrl(dest)} target="_blank" rel="noopener noreferrer">
                                            <Navigation className="mr-2 h-4 w-4" />
                                            Navegar {goingToStore ? 'a la tienda' : 'al cliente'} (Google Maps)
                                        </a>
                                    </Button>
                                );
                            })()}

                            <Button variant="secondary" className="w-full h-10" onClick={() => goToDetails(order.id)}>
                                <MapIcon className="mr-2 h-4 w-4" /> Ver Detalles / Mapa / Chat
                            </Button>

                            {/* ✅ BOTONES DE FLUJO */}
                            {(order.status === 'En camino' || order.status === 'Aceptado' || order.status === 'Listo para recoger') ? (
                                <Button className="w-full h-12 bg-info hover:bg-info/90 text-info-foreground" onClick={() => handlePickupOrder(order)}>
                                    <PackageCheck className="mr-2 h-5 w-5" /> Ya retiré el pedido
                                </Button>
                            ) : (
                                <Button className={`w-full text-lg h-12 ${order.paymentMethod === 'Efectivo' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : 'bg-success hover:bg-success/90 text-success-foreground'}`} onClick={() => handleFinishDeliveryClick(order)}>
                                    <CheckCircle2 className="mr-2 h-5 w-5" />
                                    {order.paymentMethod === 'Efectivo' ? 'Ya cobré y Entregué' : 'Confirmar Entrega'}
                                </Button>
                            )}

                            {/* Soltar (solo antes de retirar) / Reportar problema (solo después de retirar) */}
                            {order.status === 'En camino' && (
                                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => openIncidentDialog(order, 'release')}>
                                    <XCircle className="mr-2 h-4 w-4" /> No puedo con este pedido
                                </Button>
                            )}
                            {order.status === 'En reparto' && (
                                order.hasReportedProblem ? (
                                    <p className="text-xs text-center text-warning font-medium flex items-center justify-center gap-1.5">
                                        <AlertTriangle className="h-3.5 w-3.5" /> Problema reportado — esperando al admin
                                    </p>
                                ) : (
                                    <Button variant="outline" size="sm" className="w-full text-warning border-warning/30 hover:bg-warning/10" onClick={() => openIncidentDialog(order, 'report')}>
                                        <AlertTriangle className="mr-2 h-4 w-4" /> Reportar problema
                                    </Button>
                                )
                            )}
                        </CardFooter>
                    </Card>
                ))
            )}
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
                <div className="bg-warning/15 p-4 rounded-lg border border-warning text-center my-2">
                    <p className="font-bold text-warning uppercase">¡COBRAR AL CLIENTE!</p>
                    <h3 className="font-black text-2xl text-foreground">${confirmDeliveryOrder.total}</h3>
                </div>
            )}

            <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDeliveryOrder(null)}>Cancelar</Button>
                <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={confirmFinishDelivery}>
                    Sí, Entregado
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!incidentDialog} onOpenChange={(open) => !open && setIncidentDialog(null)}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>
                    {incidentDialog?.kind === 'release' ? 'Soltar este pedido' : 'Reportar un problema'}
                </DialogTitle>
                <DialogDescription>
                    {incidentDialog?.kind === 'release'
                        ? 'El pedido vuelve al pool para que otro repartidor lo tome. Contanos por qué.'
                        : 'El admin va a revisar esto y decidir cómo seguir (no cancela el pedido por vos).'}
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
                <div className="flex flex-wrap gap-2">
                    {(incidentDialog?.kind === 'release' ? RELEASE_REASONS : PROBLEM_REASONS).map(preset => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => setIncidentReason(preset)}
                            className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                        >
                            {preset}
                        </button>
                    ))}
                </div>
                <Textarea
                    value={incidentReason}
                    onChange={(e) => setIncidentReason(e.target.value)}
                    placeholder="Contanos qué pasó..."
                    rows={3}
                />
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={() => setIncidentDialog(null)} disabled={isSubmittingIncident}>Cancelar</Button>
                <Button
                    variant={incidentDialog?.kind === 'release' ? 'destructive' : 'default'}
                    onClick={submitIncident}
                    disabled={isSubmittingIncident || !incidentReason.trim()}
                >
                    {isSubmittingIncident && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {incidentDialog?.kind === 'release' ? 'Soltar pedido' : 'Enviar reporte'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}