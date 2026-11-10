'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useCollection } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { OrderService, MAX_ACTIVE_ORDERS, DRIVER_ACTIVE_STATUSES } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { gmapsDirectionsUrl, isValidCoords } from '@/lib/geo';
import { driverNetForOrder } from '@/lib/money';
import { DeliveryOnlineToggle } from '@/components/delivery-online-toggle';
import { DriverJobCard, DriverPendingNotice, cleanStoreAddress } from '@/components/driver-job-card';
import { DriverTabsList } from '@/components/driver-tabs';
import { useDriverTakeOrder } from '@/hooks/driver-take-order';
import { LocationTracker } from '@/components/location-tracker';
import { ConfirmDeliveryDialog } from '@/components/confirm-delivery-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Navigation,
  CheckCircle2,
  DollarSign,
  Truck,
  Map as MapIcon,
  PackageCheck,
  Loader2,
  XCircle,
  AlertTriangle,
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

  // A. TOMAR PEDIDO -> Pasa a 'En camino'. La lógica vive en hooks/driver-take-order.ts y
  // es la MISMA que usa el dashboard /delivery (lección R1: un solo camino): antidoble-toque,
  // su propio pedido no, solo aprobados, tope MAX_ACTIVE_ORDERS y /api/orders/take.
  const onTaken = useCallback(() => setActiveTab('active'), []);
  const take = useDriverTakeOrder({ activeCount: myActiveOrders.length, onTaken });

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

  const cleanAddress = cleanStoreAddress;

  return (
    <div className="mx-auto w-full max-w-3xl pb-24">

      {/* Tracking GPS desde el PANEL (Fase RR bis): el tracker vivía solo en la página
          de detalle del pedido — pero el repartidor opera desde acá (tomar/retirar/
          entregar están en estas tarjetas), así que en la prueba real nunca se montó y
          el mapa del comprador no mostraba la moto. Uno por pedido activo; el componente
          se auto-apaga fuera de 'En camino'/'En reparto' y el toast está deduplicado. */}
      {myActiveOrders?.map(o => (
        <LocationTracker key={`tracker-${o.id}`} orderId={o.id} isDriver={true} status={o.status} />
      ))}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-headline text-3xl font-extrabold leading-none tracking-tight">Panel de Repartidor</h1>
          {isApprovedDriver && <DeliveryOnlineToggle className="glass rounded-full py-1.5 pl-3.5 pr-2" />}
      </div>

      {isSuspended && <SuspensionNotice className="mb-4" />}

      {!isApprovedDriver && !isSuspended && <DriverPendingNotice className="mb-4" detailed />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <DriverTabsList
          value={activeTab}
          className="mb-4"
          items={[
            { value: 'available', label: `Disponibles (${availableOrders?.length || 0})`, testId: 'tab-available' },
            { value: 'active', label: `En curso (${myActiveOrders?.length || 0}/${MAX_ACTIVE_ORDERS})`, testId: 'tab-active' },
          ]}
        />

        {/* --- PESTAÑA: PEDIDOS DISPONIBLES --- */}
        <TabsContent value="available" className="mt-0 space-y-3">
          {/* 🔒 BUG-301: gate de carga. Antes no se destructuraba isLoading, así que en el
              primer render (data = []) el repartidor veía "No hay pedidos disponibles" un
              instante aunque hubiera pedidos — podía cerrar la app y perder entregas. */}
          {availableLoading ? (
            <div className="glass rounded-card py-12 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Buscando pedidos disponibles…</p>
            </div>
          ) : availableOrders?.length === 0 ? (
            <div className="glass rounded-card px-5 py-10 text-center">
                <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-foreground/[0.06] text-muted-foreground">
                    <Truck className="h-7 w-7" aria-hidden="true" />
                </span>
                <h3 className="font-headline text-2xl font-extrabold">No hay pedidos disponibles</h3>
                <p className="mt-1 text-muted-foreground">Te avisamos cuando entre uno.</p>
            </div>
          ) : (
            availableOrders?.map((order, i) => (
              <DriverJobCard
                key={order.id}
                index={i}
                order={order}
                taking={take.takingId === order.id}
                takeLabel={take.takeLabel(order.id)}
                takeDisabled={take.takeDisabled}
                onTake={() => take.takeOrder(order)}
                onDetail={() => goToDetails(order.id)}
              />
            ))
          )}
        </TabsContent>

        {/* --- PESTAÑA: PEDIDOS EN CURSO --- */}
        <TabsContent value="active" className="mt-0 space-y-4">
            {myOrdersLoading ? (
                <div className="glass rounded-card py-12 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Cargando tus pedidos…</p>
                </div>
            ) : myActiveOrders?.length === 0 ? (
                <div className="glass rounded-card px-5 py-10 text-center">
                    <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-success/15 text-success">
                        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h3 className="font-headline text-2xl font-extrabold">Estás libre</h3>
                    <p className="mt-1 text-muted-foreground">Andá a &quot;Disponibles&quot; para tomar un viaje.</p>
                </div>
            ) : (
                myActiveOrders?.map(order => {
                    const picked = order.status === 'En reparto';
                    const cash = order.paymentMethod === 'Efectivo';
                    return (
                    // Para usarse al sol y con una mano: vidrio OPACO (glass-strong) con la
                    // franja oscura arriba, los dos pasos claros (retirar, entregar), la
                    // dirección GRANDE en letra de cartel y botones de 56-72 px.
                    <article
                        key={order.id}
                        data-testid="driver-active-order"
                        className={cn('glass-strong overflow-hidden rounded-card animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none', cash && 'border-2 border-warning')}
                    >
                        <div className="flex items-center justify-between gap-3 bg-foreground px-4 py-3 text-background">
                            <span className="shrink-0 font-headline text-lg font-extrabold">{picked ? 'En reparto' : 'Pedido en curso'}</span>
                            <span className="truncate font-headline text-lg font-extrabold">{order.storeName}</span>
                        </div>
                        <ol className="divide-y divide-foreground/10" aria-label="Pasos de la entrega">
                            <li className={cn('flex gap-3 px-4 py-3.5', picked && 'text-muted-foreground')} aria-current={!picked ? 'step' : undefined}>
                                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full font-headline text-lg font-extrabold',
                                    picked ? 'bg-success text-success-foreground' : 'bg-foreground text-background')}>
                                    {picked ? <CheckCircle2 className="h-5 w-5" aria-label="Hecho" /> : '1'}
                                </span>
                                <div className="min-w-0">
                                    <p className="font-headline text-xl font-extrabold leading-tight text-foreground">{picked ? 'Retiraste en ' : 'Retirá en '}{order.storeName}</p>
                                    <p className="break-words">{cleanAddress(order.storeAddress)}</p>
                                </div>
                            </li>
                            <li className="flex gap-3 px-4 py-3.5" aria-current={picked ? 'step' : undefined}>
                                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full font-headline text-lg font-extrabold',
                                    picked ? 'bg-foreground text-background' : 'bg-foreground/[0.08] text-foreground')}>2</span>
                                <div className="min-w-0">
                                    <p className="font-headline text-xl font-extrabold leading-tight">Llevalo a {order.customerName}</p>
                                    <p className="my-1 break-words font-headline text-4xl font-extrabold leading-none tracking-tight">{custAddress(order) || 'Cargando dirección…'}</p>
                                    <p className="text-sm text-muted-foreground">Al entregar, pedile su código de 4 números.</p>
                                </div>
                            </li>
                            <li className="flex items-baseline justify-between gap-3 px-4 py-3.5">
                                <span className="text-base">Ganás por este envío</span>
                                <span className="font-headline text-3xl font-extrabold tabular-nums text-success">{money(driverNetForOrder(order))}</span>
                            </li>
                        </ol>

                        <div className="space-y-3 px-4 pb-1">
                            {/* ALERTA DE COBRO EN EFECTIVO */}
                            {cash && picked && (
                                <div className="flex items-start gap-3 rounded-2xl border-2 border-warning bg-warning/10 p-4 animate-in fade-in zoom-in-95 motion-reduce:animate-none">
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/20 text-warning">
                                        <DollarSign className="h-6 w-6" aria-hidden="true" />
                                    </span>
                                    <div>
                                        <p className="text-sm font-bold uppercase">Cobrar al cliente</p>
                                        <p className="font-medium">
                                            Tenés que recibir <span className="font-headline text-2xl font-extrabold">{money(order.total || 0)}</span> en efectivo.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* AVISO DE PAGO ONLINE */}
                            {order.paymentMethod === 'mercadopago' && (
                                <div className="flex items-center gap-3 rounded-2xl bg-success/10 p-3">
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                                    <p className="font-medium">
                                        Pagado por MercadoPago: <strong>no cobrás nada</strong>.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2.5 p-4">
                            {/* NAVEGAR CON GOOGLE MAPS (Fase RR): deep link a la app de mapas del
                                teléfono — a la TIENDA mientras va a retirar, al CLIENTE una vez
                                retirado. Es como navegan los repartidores de Rappi/PedidosYa. */}
                            {(() => {
                                const goingToStore = !picked;
                                const dest = goingToStore ? order.storeCoords : custCoords(order);
                                if (!isValidCoords(dest)) return null;
                                return (
                                    <Button asChild variant="outline" className="h-14 w-full rounded-2xl border-2 border-foreground/70 bg-transparent text-lg font-bold">
                                        <a href={gmapsDirectionsUrl(dest)} target="_blank" rel="noopener noreferrer">
                                            <Navigation className="h-5 w-5" aria-hidden="true" />
                                            Navegar {goingToStore ? 'a la tienda' : 'al cliente'}
                                        </a>
                                    </Button>
                                );
                            })()}

                            <Button variant="secondary" className="h-12 w-full rounded-2xl text-base" onClick={() => goToDetails(order.id)}>
                                <MapIcon className="h-5 w-5" aria-hidden="true" /> Ver detalle, mapa y chat
                            </Button>

                            {/* ✅ BOTONES DE FLUJO */}
                            {(order.status === 'En camino' || order.status === 'Aceptado' || order.status === 'Listo para recoger') ? (
                                <Button className="h-16 w-full rounded-2xl font-headline text-2xl font-extrabold [&_svg]:size-6" onClick={() => handlePickupOrder(order)}>
                                    <PackageCheck aria-hidden="true" /> Ya lo retiré
                                </Button>
                            ) : (
                                <Button className={cn('h-[4.5rem] w-full rounded-2xl font-headline text-2xl font-extrabold [&_svg]:size-6',
                                    cash ? 'bg-warning text-warning-foreground hover:bg-warning/90' : 'bg-success text-success-foreground hover:bg-success/90')}
                                    onClick={() => handleFinishDeliveryClick(order)}>
                                    <CheckCircle2 aria-hidden="true" />
                                    {cash ? 'Ya cobré y lo entregué' : 'Ya lo entregué'}
                                </Button>
                            )}

                            {/* Soltar (solo antes de retirar) / Reportar problema (solo después de retirar) */}
                            {order.status === 'En camino' && (
                                <Button variant="ghost" className="h-12 w-full rounded-2xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openIncidentDialog(order, 'release')}>
                                    <XCircle className="h-5 w-5" aria-hidden="true" /> No puedo con este pedido
                                </Button>
                            )}
                            {picked && (
                                order.hasReportedProblem ? (
                                    <p className="flex items-center justify-center gap-1.5 py-2 text-center text-sm font-medium">
                                        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" /> Problema reportado: esperando al admin
                                    </p>
                                ) : (
                                    <Button variant="ghost" className="h-12 w-full rounded-2xl text-base hover:bg-warning/10" onClick={() => openIncidentDialog(order, 'report')}>
                                        <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" /> Reportar problema
                                    </Button>
                                )
                            )}
                        </div>
                    </article>
                    );
                })
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
        <DialogContent className="w-[calc(100%-1.5rem)] rounded-card sm:max-w-md sm:rounded-card">
            <DialogHeader>
                <DialogTitle className="font-headline text-2xl font-extrabold">
                    {incidentDialog?.kind === 'release' ? 'Soltar este pedido' : 'Reportar un problema'}
                </DialogTitle>
                <DialogDescription>
                    {incidentDialog?.kind === 'release'
                        ? 'El pedido vuelve a la lista de disponibles para que lo tome otro repartidor. Contanos por qué.'
                        : 'El admin va a revisar esto y decidir cómo seguir (no cancela el pedido por vos).'}
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
                    {(incidentDialog?.kind === 'release' ? RELEASE_REASONS : PROBLEM_REASONS).map(preset => (
                        <button
                            key={preset}
                            type="button"
                            aria-pressed={incidentReason === preset}
                            onClick={() => setIncidentReason(preset)}
                            className={cn('min-h-[2.75rem] rounded-full border px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                incidentReason === preset ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/15 bg-foreground/[0.04] hover:border-primary')}
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
                    className="rounded-2xl text-base"
                    aria-label="Motivo"
                />
            </div>

            <DialogFooter className="gap-2">
                <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setIncidentDialog(null)} disabled={isSubmittingIncident}>Cancelar</Button>
                <Button
                    className="h-12 rounded-2xl"
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