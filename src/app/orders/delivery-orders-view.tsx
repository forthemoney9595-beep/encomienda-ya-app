'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { OrderService, MAX_ACTIVE_ORDERS, DRIVER_ACTIVE_STATUSES } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { gmapsDirectionsUrl, distanceMeters, formatDistance, isValidCoords } from '@/lib/geo';
import { DeliveryTripInfo } from '@/components/delivery-trip-info';
import { DeliveryOnlineToggle } from '@/components/delivery-online-toggle';
import { LocationTracker } from '@/components/location-tracker';
import { ConfirmDeliveryDialog } from '@/components/confirm-delivery-dialog';
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
import { SuspensionNotice } from '@/components/suspension-notice';
import { cn } from '@/lib/utils';
import { money } from '@/lib/format-money';

const RELEASE_REASONS = ['Se me rompió el vehículo', 'Emergencia personal', 'No pude ubicar la dirección'];
const PROBLEM_REASONS = ['El cliente no responde', 'Dirección incorrecta/inaccesible', 'El cliente rechazó el pedido', 'El cliente no tiene el código de entrega'];

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
  // customerCoords/shippingInfo: PII de alta sensibilidad (AUTHZ-001). En los pedidos
  // NUEVOS ya NO vienen en el doc principal (viven en orders/{id}/private) — solo se
  // leen para los pedidos ASIGNADOS vía privateById. Se dejan opcionales por los pedidos
  // legacy que todavía los tienen embebidos.
  customerCoords?: { latitude: number; longitude: number } | null;
  // Distancia tienda→cliente (metros, línea recta) denormalizada: la muestra el pool SIN
  // exponer las coords del cliente.
  deliveryDistanceM?: number | null;
  // 9/11/2026: origen de esa distancia ('route' = Google por ruta, 'line' = recta), tiempo
  // del viaje en moto (segundos) y zona aproximada del cliente (texto, nunca coords).
  deliveryDistanceSource?: 'route' | 'line' | null;
  deliveryDurationS?: number | null;
  deliveryZone?: string | null;
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
  // Fase YY ter: suspendido ≠ pendiente. Termina lo que lleva, no toma nuevos, y ve el motivo.
  const isSuspended = userProfile?.suspension?.active === true;

  // 1. PESTAÑA ACTIVA
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'available');
  // Tanda B: el ?tab= solo se respetaba en el PRIMER montaje — navegar a
  // /orders?tab=active desde otra página con el componente ya montado no cambiaba nada.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'available' || tab === 'active') setActiveTab(tab);
  }, [searchParams]);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);
  const [takingId, setTakingId] = useState<string | null>(null);
  const takingRef = useRef(false);

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
     // Fase YY ter: el pool solo lo puede leer un repartidor APROBADO (isApprovedDriver() en
     // las reglas). Para un pendiente o suspendido la consulta fallaba entera con
     // permission-denied (ruido en consola/Sentry): no se arma.
     if (!firestore || !isApprovedDriver) return null;
     return query(
       collection(firestore, 'orders'),
       // Que no tengan repartidor asignado
       where('deliveryPersonId', '==', null),
       where('status', 'in', ['En preparación', 'Listo para recoger'])
     );
  }, [firestore, isApprovedDriver]);

  const { data: allAvailableOrders, isLoading: availableLoading } = useCollection<Order>(availableQuery);
  // Un repartidor puede COMPRAR como cualquier vecino (decisión de producto, 18/8), pero
  // su propio pedido no aparece en su pool: tomarlo él mismo sería envío gratis de facto
  // y habilitaría auto-calificarse. La regla de Firestore también lo bloquea — esto es la
  // capa visual.
  const availableOrders = (allAvailableOrders || []).filter(o => o.userId !== user?.uid);

  // 3. QUERY: MIS PEDIDOS EN CURSO
  // 🚨 PERF-001 (auditoría oct 2026): antes escuchaba TODO el historial del repartidor
  // (`where deliveryPersonId` a secas) y filtraba los activos en memoria — a 40
  // entregas/día son ~15.000 docs (20 MB) en el celular por apertura, re-filtrados en
  // cada fix de GPS. Ahora el listener trae SOLO los activos; el historial vive en
  // /delivery/analytics (acotado por período) y la billetera.
  const myOrdersQuery = useMemo(() => {
      if (!firestore || !user) return null;
      return query(
        collection(firestore, 'orders'),
        where('deliveryPersonId', '==', user.uid),
        where('status', 'in', DRIVER_ACTIVE_STATUSES)
      );
  }, [firestore, user]);

  const { data: myActiveOrders, isLoading: myOrdersLoading } = useCollection<Order>(myOrdersQuery);

  // 🔒 PII de los pedidos ASIGNADOS (AUTHZ-001): dirección + coords + teléfono viven en
  // orders/{id}/private (no en el doc que ve el pool). Como repartidor ASIGNADO tengo
  // permiso de leerlas; las traigo por getDoc para las ≤3 activas (con fallback a los
  // campos embebidos de los pedidos legacy que todavía las traen en el doc principal).
  const [privateById, setPrivateById] = useState<Record<string, { customerCoords?: { latitude: number; longitude: number } | null; shippingInfo?: { address?: string } }>>({});
  const activeIdsKey = myActiveOrders.map(o => o.id).join(',');
  useEffect(() => {
    if (!firestore || !myActiveOrders.length) { setPrivateById({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(myActiveOrders.map(async (o) => {
        try {
          const snap = await getDoc(doc(firestore, 'order_private', o.id));
          return [o.id, snap.exists() ? snap.data() : null] as const;
        } catch { return [o.id, null] as const; }
      }));
      if (!cancelled) setPrivateById(Object.fromEntries(entries.filter(([, v]) => v)) as any);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, activeIdsKey]);
  // Dirección/coords del cliente para un pedido asignado: private primero, legacy después.
  const custAddress = (o: Order) => privateById[o.id]?.shippingInfo?.address ?? o.shippingInfo?.address;
  const custCoords = (o: Order) => privateById[o.id]?.customerCoords ?? o.customerCoords;

  // --- ACCIONES DEL PROCESO ---

  // A. TOMAR PEDIDO -> Pasa a 'En camino'
  const handleTakeOrder = async (order: Order) => {
    if (!user || !firestore) return;
    // Doble toque (prueba del 9/11): con la respuesta lenta salían DOS pedidos a la API; uno
    // lo tomaba y el otro volvía 409 → el repartidor veía "Pedido ya tomado" aunque era suyo.
    if (takingRef.current) return;
    if ((order as any).userId === user.uid) {
      toast({ variant: 'destructive', title: 'Este pedido es tuyo', description: 'Tu propio pedido lo lleva otro repartidor.' });
      return;
    }
    if (!isApprovedDriver) {
      toast({
        variant: 'destructive',
        title: isSuspended ? 'Cuenta suspendida' : 'Cuenta pendiente de aprobación',
        description: isSuspended
          ? 'No podés tomar pedidos nuevos mientras dure la suspensión. Mirá el motivo arriba y, si no estás de acuerdo, apelá.'
          : 'Un administrador debe aprobar tu cuenta antes de que puedas tomar pedidos.',
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
    takingRef.current = true;
    setTakingId(order.id);
    try {
      // Tomar el pedido va por /api/orders/take (AUTHZ-001): asigna en una tx claim-once Y
      // espeja deliveryPersonId en order_private (para que el repartidor pueda leer la PII sin
      // el lag del get() de reglas). Antes era un updateDoc directo del cliente.
      const res = await authedFetch('/api/orders/take', user, { orderId: order.id });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: res.status === 409 ? 'Pedido ya tomado' : 'No se pudo tomar', description: data.error || 'Probá de nuevo.' });
        return;
      }
      toast({ title: "¡Pedido Asignado!", description: "Ve a la tienda a retirarlo." });
      setActiveTab('active');
    } catch (error: any) {
      console.error(error);
      const isPermissionDenied = error?.code === 'permission-denied';
      toast({
        variant: "destructive",
        title: isPermissionDenied ? "Pedido ya tomado" : "Error",
        description: isPermissionDenied
          ? "Otro repartidor ya tomó este pedido justo antes que tú."
          : "No se pudo tomar el pedido.",
      });
    } finally {
      takingRef.current = false;
      setTakingId(null);
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
            firestore, order.userId, "¡En Camino a tu casa!",
            "El repartidor ya tiene tu pedido y va hacia ti.", "order_status", order.id, user
          ).catch(console.error);
        }
        // La TIENDA también (Fase PP): antes nunca se enteraba de que su pedido salió
        // del local — el retiro era mudo para quien preparó el pedido.
        if ((order as any).storeOwnerId) {
          OrderService.sendNotification(
            firestore, (order as any).storeOwnerId, "Pedido retirado",
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

  // C. FINALIZAR -> 'Entregado' va SIEMPRE por /api/orders/confirm-delivery (PIN de
  // entrega, 19/8): el diálogo compartido ConfirmDeliveryDialog maneja el flujo
  // (pide el código de 4 dígitos del cliente si el pedido lo tiene) y el servidor
  // valida, marca entregado y avisa a comprador y tienda.

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
              <Badge variant="outline" className="hidden sm:flex">{isApprovedDriver ? 'Zona Activa' : isSuspended ? 'Suspendida' : 'Pendiente'}</Badge>
              {isApprovedDriver && <DeliveryOnlineToggle />}
          </div>
      </div>

      {isSuspended && <SuspensionNotice className="mb-6" />}

      {!isApprovedDriver && !isSuspended && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-warning">Tu cuenta está pendiente de aprobación</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Un administrador tiene que revisar y aprobar tus datos (vehículo y licencia) antes de que
              puedas tomar pedidos. Asegurate de haber subido las 3 fotos de tu licencia en tu perfil.
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
          {/* 🔒 BUG-301: gate de carga. Antes no se destructuraba isLoading, así que en el
              primer render (data = []) el repartidor veía "No hay pedidos disponibles" un
              instante aunque hubiera pedidos — podía cerrar la app y perder entregas. */}
          {availableLoading ? (
            <div className="text-center py-12">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Buscando pedidos disponibles…</p>
            </div>
          ) : availableOrders?.length === 0 ? (
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
                        +{money(order.deliveryFee || 0)}
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
                    {/* 🔒 La dirección EXACTA del cliente ya no se muestra antes de tomar el
                        pedido (auditoría de privacidad ago 2026, estándar Rappi): para decidir
                        alcanza con la tienda + la distancia de abajo. Al aceptar se ve todo. */}
                    {/* Zona + km por ruta + minutos en moto (9/11/2026): lo que hace falta
                        para decidir si tomarlo, sin la dirección exacta. Pedidos legacy sin
                        distancia guardada: fallback a la recta con las coords embebidas. */}
                    {(() => {
                      const distM = typeof order.deliveryDistanceM === 'number'
                        ? order.deliveryDistanceM
                        : (isValidCoords(order.storeCoords) && isValidCoords(order.customerCoords)
                            ? distanceMeters(order.storeCoords!, order.customerCoords!) : null);
                      return (
                        <DeliveryTripInfo
                          zone={order.deliveryZone}
                          distanceM={distM}
                          durationS={order.deliveryDurationS}
                          source={order.deliveryDistanceSource ?? (distM != null ? 'line' : null)}
                        />
                      );
                    })()}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <Button
                        className="w-full"
                        size="lg"
                        onClick={() => handleTakeOrder(order)}
                        disabled={!isApprovedDriver || myActiveOrders.length >= MAX_ACTIVE_ORDERS || takingId !== null}
                    >
                        {takingId === order.id
                          ? 'Tomando el pedido…'
                          : !isApprovedDriver
                          ? (isSuspended ? 'Cuenta suspendida' : 'Cuenta pendiente de aprobación')
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
            {myOrdersLoading ? (
                <div className="text-center py-12">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">Cargando tus pedidos…</p>
                </div>
            ) : myActiveOrders?.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-success mb-3" />
                    <h3 className="text-lg font-medium">Estás libre</h3>
                    <p className="text-sm text-muted-foreground">Ve a la pestaña &quot;Disponibles&quot; para tomar un viaje.</p>
                </div>
            ) : (
                myActiveOrders?.map(order => (
                    // Rediseño 2 (Toldo): pensado para usarse al sol y con una mano. Los dos
                    // pasos claros (retirar, entregar), la dirección GRANDE en letra de cartel
                    // y botones de 56-72 px. Sin borde lateral ni insignia que late.
                    <Card key={order.id} className={`overflow-hidden border-2 ${order.paymentMethod === 'Efectivo' ? 'border-warning' : 'border-foreground'}`}>
                        <div className="flex items-center justify-between gap-3 bg-foreground px-4 py-2.5 text-background">
                            <span className="font-headline text-lg font-extrabold">Pedido en curso</span>
                            <span className="truncate font-headline text-lg font-extrabold">{order.storeName}</span>
                        </div>
                        <CardContent className="space-y-0 p-0">
                            {(() => {
                                const picked = order.status === 'En reparto';
                                return (
                                    <>
                                        <div className={cn('flex gap-3 border-b px-4 py-3', picked && 'text-muted-foreground')}>
                                            <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-foreground font-headline text-lg font-extrabold', picked && 'bg-foreground text-background')}>
                                                {picked ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : '1'}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-headline text-xl font-extrabold leading-tight text-foreground">{picked ? 'Retiraste en ' : 'Retirá en '}{order.storeName}</p>
                                                <p className="text-sm">{cleanAddress(order.storeAddress)}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 border-b px-4 py-3">
                                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-foreground font-headline text-lg font-extrabold">2</span>
                                            <div className="min-w-0">
                                                <p className="font-headline text-xl font-extrabold leading-tight">Llevalo a {order.customerName}</p>
                                                <p className="my-1 break-words font-headline text-4xl font-extrabold leading-none tracking-tight">{custAddress(order) || 'Cargando dirección…'}</p>
                                                <p className="text-sm text-muted-foreground">Al entregar, pedile su código de 4 números.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-baseline justify-between border-b px-4 py-3">
                                            <span className="text-base">Ganás por este envío</span>
                                            <span className="font-headline text-3xl font-extrabold text-success tabular-nums">{money(order.deliveryFee || 0)}</span>
                                        </div>
                                    </>
                                );
                            })()}
                            <div className="space-y-3 p-4">

                            {/* ALERTA DE COBRO EN EFECTIVO */}
                            {order.paymentMethod === 'Efectivo' && order.status === 'En reparto' && (
                                <div className="p-4 bg-warning/10 rounded-lg border-2 border-warning flex items-start gap-3 animate-in fade-in zoom-in">
                                    <div className="bg-warning/20 p-2 rounded-full">
                                        <DollarSign className="h-6 w-6 text-warning" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-warning uppercase text-sm">Cobrar al cliente</p>
                                        <p className="text-sm text-foreground font-medium">
                                            Tenés que recibir <span className="text-lg font-bold">{money(order.total || 0)}</span> en efectivo.
                                        </p>
                                    </div>
                                </div>
                            )}

                             {/* AVISO DE PAGO ONLINE */}
                             {order.paymentMethod === 'mercadopago' && (
                                <div className="p-3 bg-success/10 rounded-lg border border-success/30 flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-success" />
                                    <p className="text-sm text-foreground font-medium">
                                        Pagado por MercadoPago: <strong>no cobrás nada</strong>.
                                    </p>
                                </div>
                            )}
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            {/* NAVEGAR CON GOOGLE MAPS (Fase RR): deep link a la app de mapas del
                                teléfono — a la TIENDA mientras va a retirar, al CLIENTE una vez
                                retirado. Es como navegan los repartidores de Rappi/PedidosYa. */}
                            {(() => {
                                const goingToStore = order.status !== 'En reparto';
                                const dest = goingToStore ? order.storeCoords : custCoords(order);
                                if (!isValidCoords(dest)) return null;
                                return (
                                    <Button asChild variant="outline" className="w-full h-14 border-2 border-foreground text-base font-bold">
                                        <a href={gmapsDirectionsUrl(dest)} target="_blank" rel="noopener noreferrer">
                                            <Navigation className="mr-2 h-4 w-4" />
                                            Navegar {goingToStore ? 'a la tienda' : 'al cliente'}
                                        </a>
                                    </Button>
                                );
                            })()}

                            <Button variant="secondary" className="w-full h-12" onClick={() => goToDetails(order.id)}>
                                <MapIcon className="mr-2 h-4 w-4" /> Ver detalle, mapa y chat
                            </Button>

                            {/* ✅ BOTONES DE FLUJO */}
                            {(order.status === 'En camino' || order.status === 'Aceptado' || order.status === 'Listo para recoger') ? (
                                <Button className="w-full h-16 bg-primary font-headline text-2xl font-extrabold text-primary-foreground hover:bg-primary/90" onClick={() => handlePickupOrder(order)}>
                                    <PackageCheck className="mr-2 h-6 w-6" aria-hidden="true" /> Ya lo retiré
                                </Button>
                            ) : (
                                <Button className={`w-full h-[4.5rem] font-headline text-2xl font-extrabold ${order.paymentMethod === 'Efectivo' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : 'bg-success hover:bg-success/90 text-success-foreground'}`} onClick={() => handleFinishDeliveryClick(order)}>
                                    <CheckCircle2 className="mr-2 h-5 w-5" />
                                    {order.paymentMethod === 'Efectivo' ? 'Ya cobré y lo entregué' : 'Ya lo entregué'}
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

      <ConfirmDeliveryDialog
        open={!!confirmDeliveryOrder}
        onOpenChange={(open) => !open && setConfirmDeliveryOrder(null)}
        orderId={confirmDeliveryOrder?.id || null}
        customerName={confirmDeliveryOrder?.customerName}
        cashTotal={confirmDeliveryOrder?.paymentMethod === 'Efectivo' ? confirmDeliveryOrder?.total : null}
        user={user}
      />

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