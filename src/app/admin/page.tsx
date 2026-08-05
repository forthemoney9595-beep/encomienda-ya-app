'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, DollarSign, PackageCheck, TrendingUp, Store as StoreIcon, Bike, Activity, AlertTriangle, CheckCircle2, Pause, Download, RefreshCw, Clock, CreditCard, ChefHat, Truck, ChevronRight } from 'lucide-react';
import { downloadCsv } from '@/lib/csv-export';
import { PendingList } from './pending-list';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useAggregate, useCountFromServer } from '@/lib/firebase-aggregate';
import type { Order as OrderType } from '@/lib/order-service';
import type { Store as StoreType } from '@/lib/placeholder-data';
import { collection, query, where, doc, updateDoc, orderBy, limit, sum, count, CollectionReference, Timestamp } from 'firebase/firestore';
import { BarChart as RechartsBarChart, PieChart as RechartsPieChart, Pie, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell } from 'recharts';
import { subDays, format, startOfDay, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import AdminAuthGuard from './admin-auth-guard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { logAdminAction } from '@/lib/admin-audit';

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

// Etapas del flujo del pedido EN ORDEN. Se dibujan como un pipeline conectado (ver el
// render más abajo) en vez de tarjetas sueltas: así se lee el RECORRIDO del pedido y en
// qué punto se está acumulando la cola.
// El color progresa según de quién depende: gris (el sistema espera) → ámbar (la pelota la
// tiene la tienda) → azul (ya está en la calle). Es la misma escala semántica que usa el
// resto de la app en order-status.ts.
const PIPELINE_STAGES = [
  { status: 'Pendiente de Confirmación', label: 'Esperando tienda',  who: 'la tienda debe confirmar',        icon: Clock,        dot: 'bg-muted-foreground/40', ring: 'ring-muted-foreground/20', text: 'text-muted-foreground', tint: 'bg-muted/30' },
  { status: 'Pendiente de Pago',         label: 'Esperando pago',    who: 'el cliente debe pagar',           icon: CreditCard,   dot: 'bg-warning',             ring: 'ring-warning/30',          text: 'text-warning',          tint: 'bg-warning/10' },
  { status: 'En preparación',            label: 'Preparando',        who: 'la tienda está cocinando',        icon: ChefHat,      dot: 'bg-warning',             ring: 'ring-warning/30',          text: 'text-warning',          tint: 'bg-warning/10' },
  { status: 'Listo para recoger',        label: 'Listo para retiro', who: 'falta que lo tome un repartidor', icon: PackageCheck, dot: 'bg-warning',             ring: 'ring-warning/30',          text: 'text-warning',          tint: 'bg-warning/10' },
  { status: 'En camino',                 label: 'Yendo a la tienda', who: 'el repartidor va a retirar',      icon: Bike,         dot: 'bg-info',                ring: 'ring-info/30',             text: 'text-info',             tint: 'bg-info/10' },
  { status: 'En reparto',                label: 'Yendo al cliente',  who: 'el repartidor va a entregar',     icon: Truck,        dot: 'bg-info',                ring: 'ring-info/30',             text: 'text-info',             tint: 'bg-info/10' },
] as const;

// Dónde está físicamente el pedido en cada tramo del pipeline (se rotula debajo).
const PIPELINE_ZONES = [
  { label: 'en la tienda', from: 0, to: 3 },
  { label: 'en la calle',  from: 4, to: 5 },
] as const;

// Cuántas alertas se listan antes de resumir el resto. Con volumen real la lista completa
// se volvía una pared inmanejable (44 filas empujando todo el dashboard).
const ALERT_PREVIEW = 6;

// Tipos de alerta que se unifican en el panel "Requiere tu atención". Antes cada uno era
// un bloque aparte con su propio marco de color, apilados: tres cajas rojas/ámbar
// compitiendo por la atención y empujando el resto del dashboard fuera de pantalla.
type AlertKind = 'stuck' | 'payment' | 'incident';
const ALERT_KINDS: { k: AlertKind; label: string; icon: any; href: string }[] = [
  { k: 'stuck',    label: 'Pedidos trabados', icon: Clock,       href: '/admin/orders' },
  { k: 'payment',  label: 'Pagos',            icon: DollarSign,  href: '/admin/payment-issues' },
  { k: 'incident', label: 'Repartidores',     icon: Bike,        href: '/admin/incidents' },
];

/**
 * Formato de moneda argentino: separador de miles con PUNTO ($1.953.560). Antes se usaba
 * `toFixed(2)`, que imprime "$1953560.00" — ilegible de un vistazo y además con el punto
 * en el lugar equivocado para la convención local. Sin decimales: son pesos, los centavos
 * no aportan nada en un total de plataforma.
 */
const money = (n: number) => `$${Math.round(n || 0).toLocaleString('es-AR')}`;

/**
 * "hace X" legible a cualquier escala. Antes solo formateaba horas y minutos, así que un
 * pedido trabado de hace 3 meses mostraba "hace 2261h 14m" — técnicamente correcto e
 * inútil de leer. Se hizo evidente al cargar datos de prueba con fechas viejas.
 */
function formatElapsed(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    const restHours = Math.floor(hours - days * 24);
    return `${days} día${days === 1 ? '' : 's'}${restHours > 0 ? ` ${restHours}h` : ''}`;
  }
  const months = Math.floor(days / 30);
  const restDays = days - months * 30;
  return `${months} mes${months === 1 ? '' : 'es'}${restDays > 0 ? ` ${restDays}d` : ''}`;
}

// Estados "activos": pedidos en curso ahora. Set chico por naturaleza -> se escucha en vivo.
const ACTIVE_STATUSES = [
  'Pendiente de Confirmación',
  'Pendiente de Pago',
  'En preparación',
  'Listo para recoger',
  'En camino',
  'En reparto',
];

// Umbrales en horas: cuánto tiempo puede estar un pedido en cada estado antes de alertar.
const STUCK_THRESHOLDS_H: Record<string, number> = {
  'Pendiente de Confirmación': 1,   // la tienda debería confirmar en ≤1h
  'Pendiente de Pago':         2,   // el cliente debería pagar en ≤2h
  'En preparación':            3,   // la tienda debería tenerlo listo en ≤3h
  'Listo para recoger':        2,   // un repartidor debería tomarlo en ≤2h
  'En camino':                 3,   // el repartidor debería entregarlo en ≤3h
  'En reparto':                4,
};

// Helper seguro para obtener Date desde Timestamp o String
const getDate = (date: any): Date => {
    if (!date) return new Date();
    if (date instanceof Timestamp || (typeof date === 'object' && typeof date.toDate === 'function')) {
        return date.toDate();
    }
    return new Date(date);
};

// Usamos 'any' en el status para evitar conflictos con tipos estrictos viejos
const getStatusVariant = (status: any) => {
    switch (status) {
      case 'Entregado': return 'secondary';
      case 'En reparto': return 'default';
      case 'Pendiente de Pago': return 'default';
      case 'En preparación':
      case 'Pedido Realizado': return 'outline';
      case 'Pendiente de Confirmación': return 'outline';
      case 'Cancelado':
      case 'Rechazado': return 'destructive';
      default: return 'outline';
    }
};

function AdminDashboard() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { user: adminUser } = useAuth();

  // Aprobar / rechazar solicitudes de tiendas y repartidores
  const handleUpdateUserStatus = async (userId: string, isApproved: boolean) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'users', userId), { isApproved });
      const relatedStore = (stores as any[])?.find((s: any) => s.ownerId === userId);
      if (relatedStore) {
        await updateDoc(doc(firestore, 'stores', relatedStore.id), { isApproved });
      }
      // Aprobar una cuenta es de lo más sensible del panel (habilita a operar y cobrar) y
      // sin embargo era de lo poco que NO quedaba en el log de acciones.
      if (adminUser) {
        logAdminAction(firestore, adminUser.uid, isApproved ? 'approve_account' : 'reject_account', userId,
          relatedStore ? `tienda: ${relatedStore.name || relatedStore.id}` : 'repartidor');
      }
      toast({ title: isApproved ? 'Usuario aprobado' : 'Usuario rechazado' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  };

  // Controles de período (se declaran arriba porque la query del período los usa).
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'7d'|'30d'|'month'>('30d');
  const [alertFilter, setAlertFilter] = useState<AlertKind | 'all'>('all');
  const [analyticsSort, setAnalyticsSort] = useState<'revenue'|'orders'>('revenue');

  const analyticsFrom = useMemo(() => {
    if (analyticsPeriod === '7d') return subDays(new Date(), 7);
    if (analyticsPeriod === '30d') return subDays(new Date(), 30);
    return startOfMonth(new Date());
  }, [analyticsPeriod]);

  // La query del período cubre SIEMPRE al menos los últimos 7 días, para que el gráfico de
  // "últimos 7 días" salga del mismo set aunque el período elegido sea más corto (ej. "este mes"
  // recién empezado).
  const ordersFrom = useMemo(() => {
    const sevenDaysAgo = subDays(new Date(), 7);
    return analyticsFrom < sevenDaysAgo ? analyticsFrom : sevenDaysAgo;
  }, [analyticsFrom]);

  // ── Consultas ──────────────────────────────────────────────
  // Totales históricos: aggregation server-side (no baja documentos). refreshOnFocus para que se
  // sientan "vivos" sin mantener un listener permanente sobre TODAS las órdenes.
  const deliveredAggQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'orders'), where('status', '==', 'Entregado')) : null,
    [firestore]
  );
  const { data: deliveredAgg, error: deliveredErr, refresh: refreshDelivered } = useAggregate(
    deliveredAggQuery,
    { revenue: sum('total'), completed: count() },
    { refreshOnFocus: true }
  );

  // Comisión de la plataforma y envíos, en aggregations SEPARADAS.
  // OJO: NO se pueden meter en la misma query que `sum('total')`. Firestore exige un índice
  // que cubra el filtro + TODOS los campos agregados a la vez; tener (status,total),
  // (status,serviceFee) y (status,deliveryFee) por separado no alcanza para pedir las tres
  // sumas juntas — la query falla y `useAggregate` se traga el error, devolviendo 0 en
  // TODAS las métricas (así se rompieron las tarjetas al intentar unificarlas).
  const { data: feesAgg, refresh: refreshFees } = useAggregate(
    deliveredAggQuery, { total: sum('serviceFee') }, { refreshOnFocus: true },
  );
  const { data: shippingAgg, refresh: refreshShipping } = useAggregate(
    deliveredAggQuery, { total: sum('deliveryFee') }, { refreshOnFocus: true },
  );

  const usersCountQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'users'), where('role', '!=', 'admin')) : null,
    [firestore]
  );
  const { count: totalUsers, refresh: refreshUsers } = useCountFromServer(usersCountQuery, { refreshOnFocus: true });

  // Desglose de usuarios por rol y tasa de completado: counts de un solo campo (índice
  // automático, sin deploy). Le dan contexto a los headline numbers, que antes eran solo
  // un número suelto sin con qué compararlo.
  const buyersQ    = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'buyer')) : null, [firestore]);
  const storesQ    = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'store')) : null, [firestore]);
  const driversQ   = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'delivery')) : null, [firestore]);
  const allOrdersQ = useMemoFirebase(() => firestore ? collection(firestore, 'orders') : null, [firestore]);
  const { count: buyersCount,  refresh: rBuyers }  = useCountFromServer(buyersQ,    { refreshOnFocus: true });
  const { count: storesCount,  refresh: rStores }  = useCountFromServer(storesQ,    { refreshOnFocus: true });
  const { count: driversCount, refresh: rDrivers } = useCountFromServer(driversQ,   { refreshOnFocus: true });
  const { count: allOrdersCount, refresh: rOrders } = useCountFromServer(allOrdersQ, { refreshOnFocus: true });

  // Pedidos activos ahora (set chico) -> en vivo.
  const activeOrdersQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'orders'), where('status', 'in', ACTIVE_STATUSES)) as CollectionReference<OrderType> : null,
    [firestore]
  );
  const { data: activeOrders, isLoading: activeLoading } = useCollection<OrderType>(activeOrdersQuery);

  // Pedidos del período (acotado por fecha) -> gráfico 7 días + analíticas por tienda/repartidor.
  const periodOrdersQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'orders'), where('createdAt', '>=', Timestamp.fromDate(ordersFrom))) as CollectionReference<OrderType> : null,
    [firestore, ordersFrom]
  );
  const { data: periodOrders } = useCollection<OrderType>(periodOrdersQuery);

  // Pedidos recientes para el mini-historial (el historial completo vive paginado en /admin/orders).
  const recentOrdersQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'orders'), orderBy('createdAt', 'desc'), limit(10)) as CollectionReference<OrderType> : null,
    [firestore]
  );
  const { data: recentOrders } = useCollection<OrderType>(recentOrdersQuery);

  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') as CollectionReference<StoreType> : null, [firestore]);
  const { data: stores, isLoading: storesLoading } = useCollection<StoreType>(storesQuery);

  // Repartidores (acotado: son pocos) -> conteo de activos + lookup de nombres en analíticas.
  const driversQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'delivery')) : null, [firestore]);
  const { data: drivers } = useCollection<any>(driversQuery);

  // Usuarios pendientes de aprobación (isApproved==false: set chico) -> listas + conteos.
  const pendingUsersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('isApproved', '==', false)) : null, [firestore]);
  const { data: pendingUsers, isLoading: pendingLoading } = useCollection<any>(pendingUsersQuery);

  // Incidentes de repartidor (soltar pedido / reportar problema) -- vista previa de 8,
  // el historial completo con filtro/resolución vive en /admin/incidents (Fase FF).
  const incidentsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'driver_incidents'), orderBy('createdAt', 'desc'), limit(8)) : null, [firestore]);
  const { data: driverIncidents } = useCollection<any>(incidentsQuery);

  // Discrepancias de pago del webhook de MP -- antes esta colección no tenía NINGUNA
  // pantalla, ni siquiera un aviso acá (Fase FF). Colección pequeña por diseño (solo
  // anomalías), así que basta un límite defensivo sin paginación.
  const mismatchesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'payment_mismatches'), orderBy('createdAt', 'desc'), limit(50)) : null, [firestore]);
  const { data: paymentMismatches } = useCollection<any>(mismatchesQuery);
  const pendingMismatchesCount = (paymentMismatches || []).filter((m: any) => m.resolved !== true).length;

  const refreshTotals = () => { refreshDelivered(); refreshFees(); refreshShipping(); refreshUsers(); rBuyers(); rStores(); rDrivers(); rOrders(); };
  const dashboardLoading = activeLoading || storesLoading || pendingLoading;

  // Solicitudes pendientes de aprobación (tiendas y repartidores)
  const pendingStores = useMemo(() => {
    return (pendingUsers || [])
      .filter((u: any) => u.role === 'store')
      .map((u: any) => {
        const storeData = (stores as any[])?.find((s: any) => s.ownerId === u.id);
        return { ...u, ...storeData, id: u.id };
      });
  }, [pendingUsers, stores]);

  const pendingDelivery = useMemo(() => {
    return (pendingUsers || []).filter((u: any) => u.role === 'delivery');
  }, [pendingUsers]);

  // Totales históricos vía aggregation server-side (revenue/completados) + conteo de usuarios.
  const stats = useMemo(() => ({
    totalRevenue: deliveredAgg?.revenue ?? 0,
    totalUsers: totalUsers ?? 0,
    completedOrders: deliveredAgg?.completed ?? 0,
    totalStores: stores?.length ?? 0,
  }), [deliveredAgg, totalUsers, stores]);

  // Pedidos del período filtrados al rango elegido (periodOrders cubre >= 7 días, se recorta acá).
  const filteredOrders = useMemo(() => {
    return (periodOrders || []).filter(o => getDate(o.createdAt) >= analyticsFrom);
  }, [periodOrders, analyticsFrom]);

  const salesData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => startOfDay(subDays(new Date(), i))).reverse();
    const completedOrders = (periodOrders || []).filter(o => o.status === 'Entregado');

    return last7Days.map(day => {
        const dayString = format(day, 'yyyy-MM-dd');
        const salesForDay = completedOrders
            .filter(order => format(getDate(order.createdAt), 'yyyy-MM-dd') === dayString)
            .reduce((acc, order) => acc + (order.total || 0), 0);

        return {
            date: format(day, 'EEE', { locale: es }),
            Ventas: salesForDay,
        };
    });
  }, [periodOrders]);

  // Distribución de pedidos del PERÍODO seleccionado (antes era sobre TODOS los pedidos).
  const orderStatusData = useMemo(() => {
    const statusCounts = filteredOrders.reduce((acc, order) => {
        const status = order.status || 'Desconocido';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const stuckOrders = useMemo(() => {
    const now = Date.now();
    return (activeOrders || [])
      .filter(o => {
        const threshold = STUCK_THRESHOLDS_H[o.status];
        if (!threshold) return false;
        const ts = (o as any).updatedAt ?? o.createdAt;
        if (!ts) return false;
        const date: Date = ts.toDate ? ts.toDate() : new Date(ts);
        const hoursElapsed = (now - date.getTime()) / 3_600_000;
        return hoursElapsed >= threshold;
      })
      .map(o => {
        const ts = (o as any).updatedAt ?? o.createdAt;
        const date: Date = ts.toDate ? ts.toDate() : new Date(ts);
        const hoursElapsed = (Date.now() - date.getTime()) / 3_600_000;
        return { ...o, hoursElapsed };
      })
      .sort((a, b) => b.hoursElapsed - a.hoursElapsed);
  }, [activeOrders]);

  // Bandeja unificada de atención: pedidos trabados + discrepancias de pago + incidentes
  // de repartidor en UNA sola lista, ordenada por gravedad real y no por tipo. Antes eran
  // tres bloques separados en los que todo se pintaba de rojo por igual, así que un pedido
  // trabado hace 3 meses se veía igual de urgente que uno de hace 3 horas.
  const alerts = useMemo(() => {
    const items: {
      id: string; kind: AlertKind; severity: 'high' | 'medium';
      title: string; subtitle: string; meta: string; sortKey: number; href: string;
    }[] = [];

    stuckOrders.forEach((o: any) => items.push({
      id: `s-${o.id}`,
      kind: 'stuck',
      // Más de un día parado es otra categoría de problema que "se pasó del umbral".
      severity: o.hoursElapsed >= 24 ? 'high' : 'medium',
      title: o.status,
      subtitle: `${o.customerName || 'Cliente'} · ${o.storeName || 'Tienda'}`,
      meta: `hace ${formatElapsed(o.hoursElapsed)}`,
      sortKey: o.hoursElapsed,
      href: `/orders/${o.id}`,
    }));

    (paymentMismatches || []).filter((m: any) => m.resolved !== true).forEach((m: any) => items.push({
      id: `p-${m.id}`,
      kind: 'payment',
      severity: 'high', // siempre: es plata real sin conciliar
      title: m.reason === 'amount_mismatch' ? 'Monto no coincide' : 'Estado de orden inesperado',
      subtitle: m.reason === 'amount_mismatch'
        ? `Pagó $${(m.paidAmount || 0).toLocaleString()} · pedido $${(m.orderTotal || 0).toLocaleString()}`
        : `El pago llegó con el pedido en "${m.orderStatus}"`,
      meta: 'revisar',
      sortKey: Number.MAX_SAFE_INTEGER, // primero de todo
      href: '/admin/payment-issues',
    }));

    (driverIncidents || []).filter((i: any) => i.resolved !== true).forEach((i: any) => items.push({
      id: `i-${i.id}`,
      kind: 'incident',
      severity: i.type === 'problem_reported' ? 'high' : 'medium',
      title: i.type === 'released' ? 'Soltó el pedido' : 'Reportó un problema',
      subtitle: `${i.driverName || 'Repartidor'} · ${i.reason || ''}`,
      meta: i.type === 'problem_reported' ? 'sin resolver' : '',
      sortKey: i.type === 'problem_reported' ? 1e6 : 1e5,
      href: `/orders/${i.orderId}`,
    }));

    return items.sort((a, b) => b.sortKey - a.sortKey);
  }, [stuckOrders, paymentMismatches, driverIncidents]);

  const alertCounts = useMemo(() => ({
    all: alerts.length,
    stuck: alerts.filter(a => a.kind === 'stuck').length,
    payment: alerts.filter(a => a.kind === 'payment').length,
    incident: alerts.filter(a => a.kind === 'incident').length,
  }), [alerts]);

  const visibleAlerts = (alertFilter === 'all' ? alerts : alerts.filter(a => a.kind === alertFilter));

  // Estado en tiempo real — snapshot de QUÉ ESTÁ PASANDO AHORA en la plataforma
  const liveStatus = useMemo(() => {
    const byStatus: Record<string, number> = {};
    (activeOrders || []).forEach(o => {
      if (ACTIVE_STATUSES.includes(o.status)) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    });
    const totalActive = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const pausedStores = (stores || []).filter((s: any) => s.manuallyPaused).length;
    const activeDrivers = (drivers || []).filter((u: any) => u.status === 'Activo').length;
    const pendingApprovalStores   = (pendingUsers || []).filter((u: any) => u.role === 'store').length;
    const pendingApprovalDrivers  = (pendingUsers || []).filter((u: any) => u.role === 'delivery').length;
    return { byStatus, totalActive, pausedStores, activeDrivers, pendingApprovalStores, pendingApprovalDrivers };
  }, [activeOrders, stores, drivers, pendingUsers]);

  const storeAnalytics = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; delivered: number; cancelled: number; commission: number; rating: number; ratingCount: number }> = {};
    const delivered = filteredOrders.filter(o => o.status === 'Entregado');
    const cancelled = filteredOrders.filter(o => o.status === 'Cancelado' || o.status === 'Rechazado');

    delivered.forEach(o => {
      const sid = o.storeId || '';
      const store = stores?.find(s => s.id === sid);
      const name = (o as any).storeName || store?.name || sid.slice(0,8);
      const commRate = (store as any)?.commissionRate || 0;
      const productTotal = (o.total || 0) - (o.deliveryFee || 0);
      if (!map[sid]) map[sid] = { name, revenue: 0, delivered: 0, cancelled: 0, commission: 0, rating: 0, ratingCount: 0 };
      map[sid].revenue += o.total || 0;
      map[sid].delivered += 1;
      map[sid].commission += productTotal * commRate / 100;
    });
    cancelled.forEach(o => {
      const sid = o.storeId || '';
      if (!map[sid]) {
        const store = stores?.find(s => s.id === sid);
        map[sid] = { name: (o as any).storeName || store?.name || sid.slice(0,8), revenue: 0, delivered: 0, cancelled: 0, commission: 0, rating: 0, ratingCount: 0 };
      }
      map[sid].cancelled += 1;
    });
    // Rating from store docs
    Object.keys(map).forEach(sid => {
      const store = stores?.find(s => s.id === sid) as any;
      if (store?.rating) { map[sid].rating = store.rating; map[sid].ratingCount = store.ratingCount || 0; }
    });
    const arr = Object.values(map);
    return arr.sort((a, b) => analyticsSort === 'revenue' ? b.revenue - a.revenue : b.delivered - a.delivered);
  }, [filteredOrders, stores, analyticsSort]);

  const driverAnalytics = useMemo(() => {
    const map: Record<string, { name: string; deliveries: number; earnings: number; rating: number; ratingCount: number }> = {};
    filteredOrders.filter(o => o.status === 'Entregado' && o.deliveryPersonId).forEach(o => {
      const did = o.deliveryPersonId!;
      const driver = drivers?.find(u => u.id === did);
      const name = (o as any).deliveryPersonName || driver?.displayName || driver?.name || did.slice(0,8);
      if (!map[did]) map[did] = { name, deliveries: 0, earnings: 0, rating: 0, ratingCount: 0 };
      map[did].deliveries += 1;
      map[did].earnings += o.deliveryFee || 0;
    });
    // Rating from user docs (mismo criterio que storeAnalytics con stores/{id}.rating).
    Object.keys(map).forEach(did => {
      const driver = drivers?.find(u => u.id === did) as any;
      if (driver?.rating) { map[did].rating = driver.rating; map[did].ratingCount = driver.ratingCount || 0; }
    });
    return Object.values(map).sort((a, b) => analyticsSort === 'revenue' ? b.earnings - a.earnings : b.deliveries - a.deliveries);
  }, [filteredOrders, drivers, analyticsSort]);

  
  if (dashboardLoading) {
    return (
       <div className="container mx-auto">
        <PageHeader title="Panel de Administración" description="Resumen y estadísticas de la plataforma." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid gap-4 mt-4 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Panel de Administración" description="Resumen y estadísticas de la plataforma." />
        <Button variant="outline" size="sm" onClick={refreshTotals} className="mt-1 shrink-0 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </Button>
      </div>

      {/* ── Estado en tiempo real ─────────────────────────────────────────────────
          Rediseñado (Fase GG) a pedido del usuario: antes era una grilla irregular de
          tarjetas sueltas, con colores sin criterio, textos que no explicaban para qué
          servía cada número y ninguna acción posible (no llevaban a ningún lado).
          Ahora: (1) el flujo del pedido se muestra EN ORDEN, con el color que ya usa el
          resto de la app para ese estado (order-status.ts) y una descripción de a quién
          le toca actuar; (2) cada etapa es un LINK al filtro correspondiente de
          /admin/orders; (3) el estado de la red (tiendas/repartidores) va en su propio
          bloque separado, porque responde otra pregunta. */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <h2 className="text-sm font-semibold">Estado actual</h2>
          <span className="text-xs text-muted-foreground">— en vivo</span>
        </div>

        {/* ── Pipeline del pedido ──────────────────────────────────────────────
            Las 6 etapas dibujadas como un recorrido conectado: un círculo por etapa
            unido por una línea, con el número grande arriba y quién tiene la pelota
            abajo. En pantalla chica se apila en vertical y la línea pasa a ser lateral. */}
        <div className="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Flujo del pedido
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Tocá una etapa para ver esos pedidos</p>
            </div>
            <Link href="/admin/orders" className="group flex items-baseline gap-2 text-right transition-opacity hover:opacity-80">
              <span className="text-4xl font-bold leading-none text-primary">{liveStatus.totalActive}</span>
              <span className="text-xs text-muted-foreground">en curso →</span>
            </Link>
          </div>

          {liveStatus.totalActive === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" /> Ningún pedido en curso — todo entregado.
            </div>
          ) : (
            <>
              <div className="relative flex flex-col gap-1 sm:flex-row sm:gap-0">
                {/* Línea conectora: horizontal en desktop, vertical en móvil. Va detrás de
                    los círculos y se recorta a los extremos para no sobresalir. */}
                <div className="pointer-events-none absolute left-[1.375rem] top-6 bottom-6 w-px bg-border sm:left-0 sm:right-0 sm:top-[1.625rem] sm:bottom-auto sm:h-px sm:w-auto sm:mx-[8.333%]" />

                {PIPELINE_STAGES.map(stage => {
                  const n = liveStatus.byStatus[stage.status] || 0;
                  const active = n > 0;
                  return (
                    <Link
                      key={stage.status}
                      href={`/admin/orders?status=${encodeURIComponent(stage.status)}`}
                      className="group relative flex flex-1 items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/40 sm:flex-col sm:gap-0 sm:text-center"
                    >
                      {/* Nodo */}
                      <span
                        className={cn(
                          'relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-4 ring-offset-0 transition-transform group-hover:scale-105',
                          active ? `${stage.tint} ${stage.ring}` : 'bg-muted/40 ring-background',
                        )}
                        style={{ boxShadow: '0 0 0 6px hsl(var(--card) / 0.5)' }}
                      >
                        <stage.icon className={cn('h-5 w-5', active ? stage.text : 'text-muted-foreground/40')} />
                        {active && (
                          <span className={cn('absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card', stage.dot)} />
                        )}
                      </span>

                      <span className="min-w-0 sm:mt-3 sm:w-full">
                        <span className={cn('block text-2xl font-bold leading-none sm:text-3xl', active ? stage.text : 'text-muted-foreground/40')}>
                          {n}
                        </span>
                        <span className={cn('mt-1.5 block text-[13px] font-medium leading-tight sm:text-xs', active ? 'text-foreground' : 'text-muted-foreground')}>
                          {stage.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground sm:text-[10px]">
                          {stage.who}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* Zonas: dónde está físicamente el pedido. Solo en desktop, donde el
                  pipeline se lee de izquierda a derecha. */}
              <div className="mt-4 hidden gap-2 sm:flex">
                {PIPELINE_ZONES.map(zone => {
                  const span = zone.to - zone.from + 1;
                  const count = PIPELINE_STAGES
                    .slice(zone.from, zone.to + 1)
                    .reduce((s, st) => s + (liveStatus.byStatus[st.status] || 0), 0);
                  return (
                    <div
                      key={zone.label}
                      style={{ flexGrow: span }}
                      className="rounded-md border border-dashed border-border/70 px-2 py-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {zone.label} · {count}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Estado de la red: responde "¿tengo con qué operar?" */}
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Capacidad de la red
          </p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {(() => {
              const pend = liveStatus.pendingApprovalStores + liveStatus.pendingApprovalDrivers;
              const noDrivers = liveStatus.activeDrivers === 0;
              const cards = [
                {
                  href: '/admin/stores', icon: StoreIcon, value: (stores?.length || 0) - liveStatus.pausedStores,
                  label: 'Tiendas operando', hint: 'pueden recibir pedidos',
                  color: 'text-success', alert: false,
                },
                {
                  href: '/admin/stores', icon: Pause, value: liveStatus.pausedStores,
                  label: 'Tiendas pausadas', hint: 'cortaron pedidos a mano',
                  color: liveStatus.pausedStores > 0 ? 'text-warning' : 'text-muted-foreground/40',
                  alert: liveStatus.pausedStores > 0, tone: 'warning' as const,
                },
                {
                  href: '/admin/delivery', icon: Bike, value: liveStatus.activeDrivers,
                  label: 'Repartidores activos',
                  hint: noDrivers ? 'nadie puede entregar' : 'aprobados y disponibles',
                  color: noDrivers ? 'text-destructive' : 'text-info',
                  alert: noDrivers, tone: 'destructive' as const,
                },
                {
                  href: '/admin/users', icon: pend > 0 ? AlertTriangle : CheckCircle2, value: pend,
                  label: 'Esperando aprobación',
                  hint: pend > 0 ? 'no pueden operar todavía' : 'nada pendiente',
                  color: pend > 0 ? 'text-destructive' : 'text-muted-foreground/40',
                  alert: pend > 0, tone: 'destructive' as const,
                },
              ];
              return cards.map((c, i) => (
                <Link
                  key={i}
                  href={c.href}
                  className={cn(
                    'rounded-xl border p-4 transition-all hover:-translate-y-0.5',
                    c.alert && c.tone === 'destructive' ? 'border-destructive/30 bg-destructive/10 hover:bg-destructive/15'
                      : c.alert ? 'border-warning/30 bg-warning/10 hover:bg-warning/15'
                      : 'border-border bg-background/40 hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-3xl font-bold leading-none', c.color)}>{c.value}</span>
                    <c.icon className={cn('h-5 w-5 shrink-0', c.color)} />
                  </div>
                  <div className="mt-2.5 text-[13px] font-medium leading-tight">{c.label}</div>
                  <div className={cn('mt-0.5 text-[11px] leading-snug', c.alert ? c.color : 'text-muted-foreground')}>{c.hint}</div>
                </Link>
              ));
            })()}
          </div>
        </div>
      </div>
      {/* ─────────────────────────────────────────────────────── */}

      {/* ── Bandeja de atención (unificada) ───────────────────────────────────
          Antes: tres bloques apilados (trabados / discrepancias / incidentes), cada uno
          con su marco de color, todo en rojo por igual y con el hash del pedido ocupando
          espacio sin aportar. Ahora: un solo panel, con filtro por tipo, ordenado por
          gravedad REAL y con una barra de severidad por fila en vez de teñir todo. */}
      {alerts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card/50">
          <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
                <AlertTriangle className="h-[18px] w-[18px] text-destructive" />
              </span>
              <div>
                <h2 className="text-sm font-semibold leading-tight">Requiere tu atención</h2>
                <p className="text-xs text-muted-foreground">
                  {alerts.length} cosa{alerts.length === 1 ? '' : 's'} pendiente{alerts.length === 1 ? '' : 's'} de resolver
                </p>
              </div>
            </div>

            {/* Filtro por tipo: cada pastilla muestra su propio conteo. */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setAlertFilter('all')}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  alertFilter === 'all' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70')}
              >
                Todo ({alertCounts.all})
              </button>
              {ALERT_KINDS.filter(k => alertCounts[k.k] > 0).map(({ k, label, icon: Icon }) => (
                <button
                  key={k}
                  onClick={() => setAlertFilter(k)}
                  className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    alertFilter === k ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70')}
                >
                  <Icon className="h-3 w-3" /> {label} ({alertCounts[k]})
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/60">
            {visibleAlerts.slice(0, ALERT_PREVIEW).map(a => (
              <Link
                key={a.id}
                href={a.href}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                {/* Barra de severidad: reemplaza al "todo rojo". */}
                <span className={cn('h-9 w-1 shrink-0 rounded-full', a.severity === 'high' ? 'bg-destructive' : 'bg-warning')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{a.title}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.subtitle}</p>
                </div>
                {a.meta && (
                  <span className={cn('shrink-0 text-xs font-medium tabular-nums',
                    a.severity === 'high' ? 'text-destructive' : 'text-warning')}>
                    {a.meta}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>

          {visibleAlerts.length > ALERT_PREVIEW && (
            <Link
              href={ALERT_KINDS.find(k => k.k === alertFilter)?.href ?? '/admin/orders'}
              className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <span>Y {visibleAlerts.length - ALERT_PREVIEW} más</span>
              <span className="shrink-0 font-medium">Ver todas →</span>
            </Link>
          )}

          <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
            Un pedido se marca trabado según su estado: confirmación ≥1h · pago ≥2h · preparación ≥3h · retiro ≥2h · entrega ≥3h
          </p>
        </div>
      )}

      {/* Solicitudes de aprobación pendientes */}
      {(pendingStores.length > 0 || pendingDelivery.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <PendingList
            title="Solicitudes: Tiendas"
            icon={StoreIcon}
            users={pendingStores}
            isLoading={pendingLoading}
            onApprove={(id) => handleUpdateUserStatus(id, true)}
            onReject={(id) => handleUpdateUserStatus(id, false)}
          />
          <PendingList
            title="Solicitudes: Repartidores"
            icon={Bike}
            users={pendingDelivery}
            isLoading={pendingLoading}
            onApprove={(id) => handleUpdateUserStatus(id, true)}
            onReject={(id) => handleUpdateUserStatus(id, false)}
          />
        </div>
      )}

      {/* ── Totales históricos ────────────────────────────────────────────────
          Antes eran tres números sueltos sin con qué compararlos, y el monto salía como
          "$1953560.00" (toFixed, sin separador de miles y con el punto donde va la coma
          en Argentina). Ahora cada tarjeta desglosa lo que ese número esconde. */}
      {/* Si la aggregation falla (típicamente por un índice faltante), avisarlo en vez de
          mostrar $0 como si no hubiera ventas. */}
      {deliveredErr && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            No se pudieron calcular los totales{(deliveredErr as any)?.code === 'failed-precondition' ? ' — falta un índice de Firestore (el link para crearlo está en la consola)' : ''}.
            Los números de abajo pueden estar incompletos.
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(() => {
          const revenue   = stats.totalRevenue;
          const completed = stats.completedOrders;
          const fees      = feesAgg?.total ?? 0;
          const shipping  = shippingAgg?.total ?? 0;
          // Lo que va a las tiendas: el total menos lo que se lleva la plataforma y menos
          // el envío que cobra el repartidor.
          const toStores  = Math.max(0, revenue - fees - shipping);
          const avgTicket = completed > 0 ? revenue / completed : 0;
          const totalOrd  = allOrdersCount ?? 0;
          const rate      = totalOrd > 0 ? Math.round((completed / totalOrd) * 100) : 0;

          const Row = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn('font-medium tabular-nums', accent || 'text-foreground')}>{value}</span>
            </div>
          );

          return (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Facturado</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold tabular-nums">{money(revenue)}</div>
                    <p className="text-xs text-muted-foreground">total de pedidos entregados</p>
                  </div>
                  <div className="space-y-1.5 border-t pt-2.5">
                    <Row label="Comisión de la plataforma" value={money(fees)} accent="text-success" />
                    <Row label="Envíos (a repartidores)" value={money(shipping)} accent="text-info" />
                    <Row label="A las tiendas" value={money(toStores)} />
                    <Row label="Ticket promedio" value={money(avgTicket)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Usuarios Registrados</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold tabular-nums">{(stats.totalUsers || 0).toLocaleString('es-AR')}</div>
                    <p className="text-xs text-muted-foreground">sin contar administradores</p>
                  </div>
                  <div className="space-y-1.5 border-t pt-2.5">
                    <Row label="Compradores" value={(buyersCount ?? 0).toLocaleString('es-AR')} />
                    <Row label="Tiendas" value={(storesCount ?? 0).toLocaleString('es-AR')} accent="text-info" />
                    <Row label="Repartidores" value={(driversCount ?? 0).toLocaleString('es-AR')} accent="text-warning" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pedidos Entregados</CardTitle>
                  <PackageCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold tabular-nums">{completed.toLocaleString('es-AR')}</div>
                    <p className="text-xs text-muted-foreground">
                      de {totalOrd.toLocaleString('es-AR')} pedidos en total
                    </p>
                  </div>
                  <div className="space-y-2 border-t pt-2.5">
                    {/* Barra de tasa de entrega: un 49% dicho en texto no se siente igual
                        que verlo ocupar la mitad de la barra. */}
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Tasa de entrega</span>
                      <span className={cn('font-medium tabular-nums', rate >= 70 ? 'text-success' : rate >= 40 ? 'text-warning' : 'text-destructive')}>
                        {rate}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all', rate >= 70 ? 'bg-success' : rate >= 40 ? 'bg-warning' : 'bg-destructive')}
                        style={{ width: `${Math.min(100, rate)}%` }}
                      />
                    </div>
                    <Row label="Todavía en curso" value={liveStatus.totalActive.toLocaleString('es-AR')} />
                  </div>
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>

       <div className="grid gap-4 mt-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Ventas de los Últimos 7 Días</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
             <ChartContainer config={{ Ventas: { label: "Ventas", color: "hsl(var(--chart-1))" }}} className="h-[300px] w-full">
                <RechartsBarChart accessibilityLayer data={salesData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => `$${value}`} />
                   <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value) => `$${Number(value).toFixed(2)}`} />} />
                  <Bar dataKey="Ventas" fill="var(--color-Ventas)" radius={4} />
                </RechartsBarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Distribución de Pedidos</CardTitle>
             <CardDescription>Estado actual de todos los pedidos.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[300px] w-full">
              <RechartsPieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="hsl(var(--chart-1))" label={(entry) => `${entry.name} (${entry.value})`}>
                      {orderStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                  </Pie>
                  <Legend />
              </RechartsPieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
      {/* Analíticas por tienda y repartidor */}
      <div className="mt-6 space-y-4">
        {/* Controles de período y orden */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Período:</span>
          {(['7d','30d','month'] as const).map(p => (
            <button key={p} onClick={() => setAnalyticsPeriod(p)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                analyticsPeriod === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}>
              {p === '7d' ? '7 días' : p === '30d' ? '30 días' : 'Este mes'}
            </button>
          ))}
          <span className="ml-4 text-sm font-medium text-muted-foreground">Ordenar por:</span>
          <button onClick={() => setAnalyticsSort('revenue')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
              analyticsSort === 'revenue' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}>Ingresos</button>
          <button onClick={() => setAnalyticsSort('orders')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
              analyticsSort === 'orders' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}>Pedidos</button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Por tienda */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base"><StoreIcon className="h-4 w-4 text-info" /> Por tienda</CardTitle>
                {storeAnalytics.length > 0 && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1.5" onClick={() => {
                    const period = analyticsPeriod === '7d' ? 'ultimos7d' : analyticsPeriod === '30d' ? 'ultimos30d' : analyticsPeriod === 'month' ? 'estemes' : 'todo';
                    downloadCsv(storeAnalytics.map(s => ({
                      'Tienda': s.name, 'Ventas brutas': s.revenue, 'Entregados': s.delivered,
                      'Cancelados': s.cancelled, 'Comisión': Math.round(s.commission),
                      'Rating': s.ratingCount > 0 ? s.rating.toFixed(1) : '',
                    })), `tiendas_${period}.csv`);
                  }}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tienda</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Entregados</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeAnalytics.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin datos.</TableCell></TableRow>
                  )}
                  {storeAnalytics.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right text-success font-bold">${s.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{s.delivered}</TableCell>
                      <TableCell className="text-right text-primary">${s.commission.toFixed(0)}</TableCell>
                      <TableCell className="text-right text-warning">{s.ratingCount > 0 ? `${s.rating.toFixed(1)} ★` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Por repartidor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Bike className="h-4 w-4 text-primary" /> Por repartidor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repartidor</TableHead>
                    <TableHead className="text-right">Entregas</TableHead>
                    <TableHead className="text-right">Ganancias</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverAnalytics.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Sin datos.</TableCell></TableRow>
                  )}
                  {driverAnalytics.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-right">{d.deliveries}</TableCell>
                      <TableCell className="text-right text-success font-bold">${d.earnings.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-warning">{d.ratingCount > 0 ? `${d.rating.toFixed(1)} ★` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Pedidos Recientes</CardTitle>
                    <CardDescription>Los últimos 10 pedidos. El historial completo está en Gestión de Pedidos.</CardDescription>
                </div>
                <Link href="/admin/orders">
                    <Button variant="outline" size="sm">Ver todos</Button>
                </Link>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Pedido</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Tienda</TableHead>
                            <TableHead>Repartidor</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {(recentOrders && recentOrders.length > 0) ? (
                        recentOrders.map((order) => (
                        <TableRow key={order.id} className="cursor-pointer" onClick={() => router.push(`/orders/${order.id}`)}>
                            <TableCell className="font-medium">
                                <Link href={`/orders/${order.id}`} className="hover:underline">#{order.id.substring(0, 7)}</Link>
                            </TableCell>
                             <TableCell>{order.customerName}</TableCell>
                             <TableCell>{order.storeName}</TableCell>
                             <TableCell>{order.deliveryPersonName || 'N/A'}</TableCell>
                            <TableCell>
                               <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold">${(order.total || 0).toFixed(2)}</TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No hay pedidos en el historial.
                            </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function GuardedAdminDashboard() {
  return (
    <AdminAuthGuard>
      <AdminDashboard />
    </AdminAuthGuard>
  );
}