'use client';

import { useAuth } from '@/context/auth-context';
import { money } from '@/lib/format-money';
import { useFirestore, useCollection, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp, orderBy, limit, startAfter, getDocs, type QueryDocumentSnapshot } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { OrderService, STORE_LIVE_STATUSES, STORE_HISTORY_STATUSES } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
import { Clock, CheckCircle2, Megaphone, Utensils, CreditCard, Bike, Eye, Inbox, Minus, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { StoreTabsList, StoreTabsTrigger } from '@/components/store-tabs';
import { StoreTicketPaper, TicketRule } from '@/components/store-comanda';
import { confirmStoreOrder } from '@/lib/store-confirm-order';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Beep de pedido nuevo (helper compartido en lib/beep — antes estaba inline acá).
import { playBeep as playNewOrderBeep } from '@/lib/beep';
import { useConfirmTimeoutWatcher } from '@/hooks/use-confirm-timeout';
import { ConfirmCountdown } from '@/components/confirm-countdown';
import { describeOrderEnding } from '@/lib/confirm-timeout';

const TAB_VALUES = ['pending', 'active', 'history'] as const;
function readTabParam(): (typeof TAB_VALUES)[number] | null {
  if (typeof window === 'undefined') return null;
  const t = new URLSearchParams(window.location.search).get('tab');
  return (TAB_VALUES as readonly string[]).includes(t || '') ? (t as (typeof TAB_VALUES)[number]) : null;
}

export default function StoreOrdersView() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // 🚨 PERF-002 (auditoría oct 2026): antes escuchaba TODOS los pedidos de la tienda
  // (`where storeId` a secas) y partía en memoria: a 200 pedidos/día son 2.400 docs
  // (3,4 MB) por apertura de una pestaña que queda abierta 12 h. Ahora el listener trae
  // SOLO nuevos + en curso (set chico y acotado) y el historial se pagina con getDocs.
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', userProfile.storeId),
      where('status', 'in', STORE_LIVE_STATUSES)
    );
  }, [firestore, userProfile?.storeId]);

  const { data: liveOrders, isLoading } = useCollection<any>(ordersQuery);

  // Copia ordenada (antes era `.sort()` in-place sobre el array del hook, en cada render).
  const sortedOrders = useMemo(() => [...(liveOrders || [])].sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
  }), [liveOrders]);

  const pendingOrders = useMemo(() => sortedOrders.filter(o => o.status === 'Pendiente de Confirmación'), [sortedOrders]);
  // 🚨 'Listo para recoger' FALTABA en esta lista (prueba del 15/8): marcar el pedido
  // listo desde el DETALLE setea ese estado y el pedido desaparecía del panel de la
  // tienda hasta que un repartidor lo tomaba ('En camino'). El botón del panel no lo
  // producía (deja 'En preparación' + readyForPickup), por eso nunca se había visto.
  const activeOrders = useMemo(() => sortedOrders.filter(o => o.status !== 'Pendiente de Confirmación'), [sortedOrders]);

  // Fase YY: el panel abierto de la tienda es uno de los relojes de la cancelación
  // automática — programa el recordatorio y el vencimiento de cada pedido Nuevo y le pide
  // al servidor que decida. Devuelve la hora límite que muestra cada tarjeta.
  const confirmTimes = useConfirmTimeoutWatcher(pendingOrders, user);

  // Historial: getDocs + cursor de a 20 (mismo patrón que el admin, Fase Z). Índice
  // `orders(storeId, status, createdAt DESC)`. Se carga recién al abrir la pestaña.
  const HISTORY_PAGE = 20;
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [historyCursor, setHistoryCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDone, setHistoryDone] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(() => readTabParam() === 'history');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const loadHistory = async (reset = false) => {
      if (!firestore || !userProfile?.storeId || historyLoading) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
          const base = [
              where('storeId', '==', userProfile.storeId),
              where('status', 'in', STORE_HISTORY_STATUSES),
              orderBy('createdAt', 'desc'),
          ];
          const q = (!reset && historyCursor)
              ? query(collection(firestore, 'orders'), ...base, startAfter(historyCursor), limit(HISTORY_PAGE))
              : query(collection(firestore, 'orders'), ...base, limit(HISTORY_PAGE));
          const snap = await getDocs(q);
          const page = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setHistoryOrders(prev => (reset ? page : [...prev, ...page]));
          setHistoryCursor(snap.docs[snap.docs.length - 1] ?? null);
          setHistoryDone(snap.docs.length < HISTORY_PAGE);
      } catch (e: any) {
          console.error('Historial de pedidos:', e);
          setHistoryError(e?.code === 'failed-precondition'
              ? 'Falta un índice de Firestore para el historial (avisale a soporte).'
              : 'No se pudo cargar el historial.');
      } finally {
          setHistoryLoading(false);
      }
  };
  useEffect(() => {
      if (historyOpened && historyOrders.length === 0 && !historyDone) loadHistory(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpened, userProfile?.storeId]);

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
              toast({ title: "Repartidores avisados", description: `Se notificó a ${data.notified} repartidores.` });
          } else {
              toast({ variant: "destructive", title: "No hay repartidores", description: "No se encontraron repartidores registrados." });
          }
      } catch (e) {
          console.error("Error en broadcast:", e);
          toast({ variant: "destructive", title: "Error al notificar" });
      }
  };

  // Anti doble-toque (punto 6 de la prueba, 18/8): sin esta guarda, el segundo toque
  // disparaba OTRA confirmación que rebotaba con 400 "ya no está pendiente" — cartel
  // rojo con el pedido ya aceptado, pura confusión.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const handleConfirmStock = async (order: any, removedItemIds: string[] = [], adjustedQuantities: Record<string, number> = {}) => {
      if (confirmingId) return;
      setConfirmingId(order.id);
      try {
          // Misma función que la comanda de /my-store (lección R1: un solo camino a
          // /api/orders/confirm-stock). Saca los ajustes de ítems destildados adentro.
          const r = await confirmStoreOrder(user, { orderId: order.id, storeId: userProfile?.storeId, removedItemIds, adjustedQuantities });
          toast({ title: r.title, description: r.description });
      } catch (error: any) {
          toast({ variant: "destructive", title: "No se pudo confirmar", description: error.message });
      } finally {
          setConfirmingId(null);
      }
  };

  // Va por API: rechazar tiene que DEVOLVER al catálogo las unidades que `create` reservó.
  // Antes era un updateDoc directo, así que el pedido moría y el stock quedaba descontado
  // para siempre. La API también notifica al comprador (antes se hacía acá, y se perdía si
  // el navegador se cerraba justo después del update).
  const handleRejectOrder = async (order: any) => {
      if (!user) return;
      if(!confirm("¿Estás seguro de rechazar este pedido?")) return;
      try {
          const res = await authedFetch('/api/orders/reject', user, { orderId: order.id });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al rechazar');
          toast({
              title: "Pedido Rechazado",
              description: data.unitsReturned > 0
                  ? `${data.unitsReturned} unidad(es) volvieron a tu stock.`
                  : undefined,
          });
      } catch (error: any) {
          toast({ variant: "destructive", title: "Error al rechazar", description: error.message });
      }
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
                "Pedido Listo",
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

  // Pestaña inicial desde ?tab= (pending | active | history): la comanda de /my-store manda
  // a "Nuevos" para ajustar o sacar productos. window.location y no useSearchParams (en Next
  // exige Suspense), igual que /login.
  // (Esta vista solo se pinta en el cliente, después de cargar la sesión: leer la URL en el
  // inicializador no genera diferencias de hidratación.)
  const [tab, setTab] = useState<string>(() => readTabParam() ?? 'active');
  const changeTab = (v: string) => {
      setTab(v);
      if (v === 'history') setHistoryOpened(true);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Clock className="mx-auto h-8 w-8 animate-spin mb-2"/>Cargando pedidos...</div>;

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Pedidos" description="Confirmá los nuevos, avisá cuando estén listos y mirá el historial." />

      <Tabs value={tab} className="w-full" onValueChange={changeTab}>
        <StoreTabsList className="mb-5">
          <StoreTabsTrigger value="pending">
             Nuevos
             {pendingOrders.length > 0 && <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground tabular-nums">{pendingOrders.length}</span>}
          </StoreTabsTrigger>
          <StoreTabsTrigger value="active">En curso <span className="ml-1 tabular-nums opacity-80">({activeOrders.length})</span></StoreTabsTrigger>
          <StoreTabsTrigger value="history">Historial</StoreTabsTrigger>
        </StoreTabsList>

        {/* PESTAÑA PENDIENTES */}
        <TabsContent value="pending" className="space-y-4 lg:max-w-3xl">
            {pendingOrders.length === 0 ? (
                <Card className="px-4 py-10 text-center">
                    <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Inbox className="h-7 w-7" aria-hidden="true" /></span>
                    <h3 className="font-headline text-2xl font-extrabold">Sin pedidos nuevos</h3>
                    <p className="text-muted-foreground">Cuando entre uno, suena y aparece acá para que confirmes qué tenés.</p>
                </Card>
            ) : (
                pendingOrders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onAction={(removedItemIds: string[], adjustedQuantities: Record<string, number>) => handleConfirmStock(order, removedItemIds, adjustedQuantities)}
                        onReject={() => handleRejectOrder(order)}
                        isDisabled={confirmingId !== null}
                        actionLabel={confirmingId === order.id ? 'Confirmando…' : 'Confirmar pedido'}
                        actionIcon={CheckCircle2}
                        statusColor="border-l-warning"
                        statusLabel="Solicitud Nueva"
                        statusBadgeColor="bg-warning/15 text-warning border-warning/30"
                        selectable
                        timeoutAt={confirmTimes[order.id]?.timeoutAt}
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
                        label = "Volver a avisar a los repartidores"; 
                        icon = Megaphone;
                        isDisabled = false; 
                    } else {
                        label = "Pedido listo: avisar a los repartidores";
                        icon = Utensils;
                        isDisabled = false;
                    }
                    badgeColor = "bg-warning/15 text-warning border-warning/30";
                } else if (order.status === 'Listo para recoger') {
                    // Estado que setea el DETALLE del pedido. Sin repartidor asignado,
                    // la tienda puede re-avisar; con repartidor, es informativo.
                    if (!order.deliveryPersonId) {
                        action = () => handleNotifyDriver(order);
                        label = "Volver a avisar a los repartidores";
                        icon = Megaphone;
                        isDisabled = false;
                    } else {
                        label = "Repartidor asignado";
                        icon = Bike;
                        isDisabled = true;
                    }
                    badgeColor = "bg-warning/15 text-warning border-warning/30";
                } else if (order.status === 'En camino') {
                    label = "Repartidor yendo a retirar";
                    icon = Bike;
                    isDisabled = true;
                    badgeColor = "bg-info/15 text-info border-info/30";
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
                <Card className="px-4 py-10 text-center text-muted-foreground">
                    <p>No hay pedidos en curso en este momento.</p>
                </Card>
            )}
        </TabsContent>

        {/* PESTAÑA HISTORIAL (paginado bajo demanda, PERF-002) */}
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
            {historyError && (
                <p className="text-center text-sm text-destructive py-4">{historyError}</p>
            )}
            {!historyLoading && !historyError && historyOrders.length === 0 && historyDone && (
                <Card className="px-4 py-10 text-center text-muted-foreground">
                    <p>Todavía no hay pedidos entregados, cancelados ni rechazados.</p>
                </Card>
            )}
            {historyLoading && (
                <div className="p-6 text-center text-muted-foreground"><Clock className="mx-auto h-6 w-6 animate-spin mb-2"/>Cargando historial...</div>
            )}
            {!historyLoading && !historyDone && historyOrders.length > 0 && (
                <div className="text-center pt-2">
                    <Button variant="outline" className="h-11 rounded-full bg-transparent px-6" onClick={() => loadHistory(false)}>Cargar más</Button>
                </div>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ✅ COMPONENTE TARJETA MEJORADO (Con botón de Navegación)
function OrderCard({ order, onAction, onReject, actionLabel, actionIcon: Icon, isDisabled, statusColor, statusLabel, statusBadgeColor, selectable, timeoutAt }: any) {
    const ending = describeOrderEnding(order);
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
    // Ajuste de cantidad, solo REDUCIR (caso real: piden 4 pizzas, hay para 2 — antes la
    // única opción era sacar el renglón entero). itemId -> cantidad a preparar.
    const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
    const bumpQty = (itemId: string, delta: number, orderedQty: number) => {
        setQtyOverrides(prev => {
            const current = prev[itemId] ?? orderedQty;
            const next = Math.min(orderedQty, Math.max(1, current + delta));
            const copy = { ...prev };
            if (next === orderedQty) delete copy[itemId]; else copy[itemId] = next;
            return copy;
        });
    };
    const adjustedCount = Object.keys(qtyOverrides).filter(id => !uncheckedIds.has(id)).length;
    const allUnchecked = selectable && order.items?.length > 0 && uncheckedIds.size === order.items.length;

    const statusBadge = (
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusBadgeColor || 'border-border bg-muted text-muted-foreground')}>
            {statusLabel || order.status}
        </span>
    );
    const created = format(order.createdAt?.toDate ? order.createdAt.toDate() : new Date(), "d MMM, HH:mm", { locale: es });

    const itemsList = (
        <ul className={cn('space-y-1', selectable ? 'text-base' : 'text-sm')}>
            {order.items?.map((item: any, i: number) => {
                const prepQty = qtyOverrides[item.id] ?? item.quantity;
                const removed = uncheckedIds.has(item.id);
                const isAdjusted = selectable && !removed && prepQty < item.quantity;
                const name = item.title || item.name;
                return (
                    <ItemRow
                        key={item.id || i}
                        selectable={!!selectable}
                        name={name}
                        label={isAdjusted ? `${prepQty} de ${item.quantity}` : `${item.quantity}×`}
                        amount={money(item.price * prepQty)}
                        removed={removed}
                        adjusted={isAdjusted}
                        onToggle={() => toggleItem(item.id)}
                        canAdjust={!!selectable && item.quantity > 1 && !removed}
                        canMinus={prepQty > 1}
                        canPlus={prepQty < item.quantity}
                        onMinus={() => bumpQty(item.id, -1, item.quantity)}
                        onPlus={() => bumpQty(item.id, +1, item.quantity)}
                    />
                );
            })}
        </ul>
    );

    // Desglose del total (Fase RR bis): los ítems suman solo los productos, pero el total
    // incluye envío y tarifa — sin esta línea la cuenta "no cerraba" a la vista ($4.400 de
    // ítems vs $6.720 de total, caso real de la prueba).
    const breakdown = (() => {
        const delivery = Number(order.deliveryFee) || 0;
        const service = Number(order.serviceFee) || 0;
        const total = Number(order.total) || 0;
        const products = typeof order.subtotal === 'number'
            ? order.subtotal
            : Math.max(0, total - delivery - service);
        if (!delivery && !service) return null;
        return (
            <p className="text-sm text-muted-foreground">
                Productos {money(products)} · Envío {money(delivery)}
                {service > 0 && <> · Tarifa {money(service)}</>}
                {' '}= {money(total)}
            </p>
        );
    })();

    const changesNote = selectable && (uncheckedIds.size > 0 || adjustedCount > 0) && (
        <p className="text-sm font-semibold text-warning">
            {uncheckedIds.size > 0 && `Vas a confirmar sin ${uncheckedIds.size} producto(s). `}
            {adjustedCount > 0 && `${adjustedCount} producto(s) con cantidad reducida. `}
            El cliente verá el total nuevo antes de pagar.
        </p>
    );

    const actions = (
        <div className={cn('flex flex-wrap gap-2', selectable ? 'pt-1' : 'justify-end')}>
            {/* 1. Ver detalles / chat (siempre) */}
            <Button asChild variant={selectable ? 'outline' : 'secondary'} className={cn('h-11 flex-1 rounded-xl sm:flex-none', selectable && 'bg-transparent')}>
                <Link href={`/orders/${order.id}`}>
                    <Eye aria-hidden="true" /> Ver detalles / chat
                </Link>
            </Button>

            {/* 2. Rechazar */}
            {onReject && (
                <Button variant="outline" className="h-11 flex-1 rounded-xl border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 sm:flex-none" onClick={onReject}>
                    Rechazar
                </Button>
            )}

            {/* 3. Acción principal (confirmar / avisar a los repartidores) */}
            {onAction && actionLabel && (
                <Button
                    className={cn(
                        'h-11 rounded-xl font-bold',
                        selectable ? 'w-full basis-full text-base' : 'flex-1 sm:flex-none',
                        (isDisabled || allUnchecked)
                            ? 'bg-muted text-muted-foreground opacity-80'
                            : (selectable ? '' : 'bg-success text-success-foreground hover:bg-success/90'),
                    )}
                    onClick={() => onAction(Array.from(uncheckedIds), qtyOverrides)}
                    disabled={(isDisabled && !actionLabel.includes("Reenviar")) || allUnchecked}
                    title={allUnchecked ? 'Destildaste todos los productos -- rechazá el pedido en su lugar' : undefined}
                    data-testid={selectable ? 'confirm-order' : undefined}
                >
                    {Icon && <Icon aria-hidden="true" />}
                    {selectable && (uncheckedIds.size > 0 || adjustedCount > 0) ? 'Confirmar con cambios' : actionLabel}
                </Button>
            )}
        </div>
    );

    // Pedido NUEVO: ticket de papel, el mismo lenguaje que la comanda de /my-store.
    if (selectable) {
        return (
            <StoreTicketPaper role="article" aria-label={`Pedido nuevo de ${order.customerName || 'cliente'}`} data-testid="store-order-ticket" className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                    <b className="min-w-0 truncate font-headline text-2xl font-extrabold">{order.customerName || 'Cliente'}</b>
                    <span className="shrink-0 text-sm text-muted-foreground">#{order.id.substring(0, 6)} · {created}</span>
                </div>
                <TicketRule />
                <ConfirmCountdown timeoutAt={timeoutAt} variant="store" className="rounded-xl" />
                <p className="text-sm text-muted-foreground">Destildá lo que no tengas o bajá la cantidad con − y +.</p>
                {itemsList}
                {changesNote}
                <TicketRule />
                <div className="flex items-center justify-between gap-2 font-bold">
                    <span>Total del pedido</span>
                    <span className="rounded-full bg-foreground/[0.08] px-3 py-0.5 font-headline text-xl font-extrabold tabular-nums">{money(order.total || 0)}</span>
                </div>
                {breakdown}
                {actions}
            </StoreTicketPaper>
        );
    }

    return (
        <Card className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="font-headline text-xl font-extrabold leading-none">Pedido #{order.id.substring(0, 6)}</h3>
                        {statusBadge}
                    </div>
                    <p className="text-sm text-muted-foreground">{created}{order.customerName ? ` · ${order.customerName}` : ''}</p>
                </div>
                {order.paymentStatus === 'paid' && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> Pagado
                    </span>
                )}
            </div>
            {ending && (
                <p className="text-sm" data-testid="order-ending">
                    <span className="font-semibold text-destructive">{ending.label}</span>
                    {ending.detail && <span className="text-muted-foreground"> · {ending.detail}</span>}
                </p>
            )}
            <div className="rounded-2xl bg-foreground/[0.04] p-3">{itemsList}</div>
            <div className="flex items-center justify-between gap-2">
                {breakdown ?? <span />}
                <span className="shrink-0 font-headline text-xl font-extrabold text-success tabular-nums">{money(order.total || 0)}</span>
            </div>
            {((order.readyForPickup && order.status === 'En preparación') ||
              (order.status === 'Listo para recoger' && !order.deliveryPersonId)) && (
                <div className="flex items-center gap-2 rounded-xl bg-warning/10 p-2.5 text-sm font-semibold text-warning ring-1 ring-warning/30">
                    <Megaphone className="h-4 w-4 animate-pulse" aria-hidden="true" />
                    <span>Buscando repartidor… (alerta enviada)</span>
                </div>
            )}
            <div className="border-t border-foreground/10 pt-3">{actions}</div>
        </Card>
    );
}

/** Renglón de un producto del pedido. En "Nuevos" la fila entera tilda/destilda (área
 *  tocable grande) y trae − / + para reducir la cantidad. */
function ItemRow({ selectable, name, label, amount, removed, adjusted, onToggle, canAdjust, canMinus, canPlus, onMinus, onPlus }: {
    selectable: boolean; name: string; label: string; amount: string; removed: boolean; adjusted: boolean;
    onToggle: () => void; canAdjust: boolean; canMinus: boolean; canPlus: boolean; onMinus: () => void; onPlus: () => void;
}) {
    const id = useId();
    const text = (
        <span className={cn('min-w-0 flex-1 break-words', removed ? 'text-muted-foreground line-through' : adjusted ? 'font-semibold text-warning' : '')}>
            <span className="font-extrabold tabular-nums">{label}</span> {name}
        </span>
    );
    if (!selectable) {
        return (
            <li className="flex items-start justify-between gap-2">
                {text}
                <span className="shrink-0 text-muted-foreground tabular-nums">{amount}</span>
            </li>
        );
    }
    return (
        <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={id} className="flex min-h-11 min-w-0 flex-1 basis-40 cursor-pointer items-center gap-3">
                <Checkbox
                    id={id}
                    aria-label={`Incluir ${name}`}
                    checked={!removed}
                    onCheckedChange={onToggle}
                    className="h-6 w-6 rounded-md"
                />
                {text}
            </label>
            <span className="ml-auto flex shrink-0 items-center gap-2">
                {canAdjust && (
                    <span className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full bg-transparent" aria-label={`Restar uno a ${name}`} disabled={!canMinus} onClick={onMinus}><Minus aria-hidden="true" /></Button>
                        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full bg-transparent" aria-label={`Sumar uno a ${name}`} disabled={!canPlus} onClick={onPlus}><Plus aria-hidden="true" /></Button>
                    </span>
                )}
                <span className="text-muted-foreground tabular-nums">{amount}</span>
            </span>
        </li>
    );
}
