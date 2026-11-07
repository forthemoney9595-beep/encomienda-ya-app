/**
 * Cierres DIARIOS de la plataforma (Tanda T2 del panel admin, oct 2026) — colección
 * `platform_daily`, un doc por día calendario ARGENTINO (id "YYYY-MM-DD").
 *
 * Este módulo es PURO (sin Firestore): la agregación de un día la usan tanto el servidor
 * (`platform-stats.ts`, Admin SDK, que escribe los cierres) como el cliente (`/admin/finances`,
 * que calcula el día EN CURSO en vivo sobre el set chico de pedidos de hoy). Una sola función
 * para los dos lados = el "hoy" en vivo y el cierre de mañana no pueden diferir.
 *
 * Decisión de alcance (David, T2): `platform_daily` NO se escribe dentro de las transacciones
 * de plata (webhook, confirm-delivery, cancel, reject, refund quedan intactos). Lo recalcula el
 * cron de conciliación y el botón "Conciliar ahora", igual que `platform_monthly`.
 *
 * Atribución: por FECHA DE CREACIÓN del pedido (createdAt), el mismo criterio que los cierres
 * mensuales y la tarjeta de Ganancias — un pedido cuenta en el día en que nació, también si
 * se entregó al día siguiente. Fórmulas de plata 100 % de money.ts.
 */
import {
  platformBreakdownForOrder, storeNetForOrder, driverNetForOrder, type MoneyOrder,
} from './money';

/** Argentina es UTC-3 fijo (sin horario de verano) — mismo criterio que platform-stats.ts. */
export const ART_OFFSET_H = 3;

export interface DailyOrderInput extends MoneyOrder {
  status?: string;
  /** Milisegundos (ya convertidos; el llamador resuelve Timestamp/Date). */
  createdAtMs?: number | null;
  deliveredAtMs?: number | null;
}

export interface DailyBucket {
  /** Pedidos creados ese día (cualquier estado). */
  ordersCreated: number;
  delivered: number;
  cancelled: number;
  rejected: number;
  /** Facturado BRUTO: suma de `total` de los entregados (sin descontar reembolsos). */
  revenue: number;
  /** Tarifas de servicio netas de reembolsos (money.ts). */
  serviceFees: number;
  /** Comisiones a tiendas netas de reembolsos (money.ts). */
  commissions: number;
  /** Plata devuelta al comprador: suma de `refundAmount` de los pedidos reembolsados del día. */
  refunds: number;
  /** Pedidos del día con algún reembolso registrado. */
  refundedOrders: number;
  /** Neto de la app = serviceFees + commissions. */
  platform: number;
  toStores: number;
  toDrivers: number;
  /** revenue / delivered (0 si no hubo entregas). */
  avgTicket: number;
  /** Minutos promedio creación→entrega, solo sobre los entregados con ambas fechas. */
  avgDeliveryMin: number | null;
  /** Cuántos entregados aportaron al promedio de tiempo. */
  deliveryTimedCount: number;
}

export const emptyDailyBucket = (): DailyBucket => ({
  ordersCreated: 0, delivered: 0, cancelled: 0, rejected: 0,
  revenue: 0, serviceFees: 0, commissions: 0, refunds: 0, refundedOrders: 0,
  platform: 0, toStores: 0, toDrivers: 0, avgTicket: 0,
  avgDeliveryMin: null, deliveryTimedCount: 0,
});

/** Suma de buckets (para períodos): los promedios se recomponen desde los totales. */
export function sumDailyBuckets(buckets: Iterable<Partial<DailyBucket> | null | undefined>): DailyBucket {
  const out = emptyDailyBucket();
  let timedMinutes = 0;
  for (const b of buckets) {
    if (!b) continue;
    out.ordersCreated += b.ordersCreated ?? 0;
    out.delivered += b.delivered ?? 0;
    out.cancelled += b.cancelled ?? 0;
    out.rejected += b.rejected ?? 0;
    out.revenue += b.revenue ?? 0;
    out.serviceFees += b.serviceFees ?? 0;
    out.commissions += b.commissions ?? 0;
    out.refunds += b.refunds ?? 0;
    out.refundedOrders += b.refundedOrders ?? 0;
    out.platform += b.platform ?? 0;
    out.toStores += b.toStores ?? 0;
    out.toDrivers += b.toDrivers ?? 0;
    const n = b.deliveryTimedCount ?? 0;
    if (n > 0 && typeof b.avgDeliveryMin === 'number') { timedMinutes += b.avgDeliveryMin * n; out.deliveryTimedCount += n; }
  }
  out.avgTicket = out.delivered > 0 ? out.revenue / out.delivered : 0;
  out.avgDeliveryMin = out.deliveryTimedCount > 0 ? timedMinutes / out.deliveryTimedCount : null;
  return out;
}

/**
 * Agrega los pedidos CREADOS en un día. El llamador garantiza que todos pertenecen al mismo
 * día ART (el servidor consulta por rango de createdAt; el cliente también).
 */
export function aggregateDailyOrders(orders: Iterable<DailyOrderInput>, fallbackRate: number): DailyBucket {
  const b = emptyDailyBucket();
  let timedMinutes = 0;
  for (const o of orders) {
    b.ordersCreated += 1;
    if (o.refunded && (Number(o.refundAmount) || 0) > 0) { b.refunds += Number(o.refundAmount) || 0; b.refundedOrders += 1; }
    if (o.status === 'Cancelado') { b.cancelled += 1; continue; }
    if (o.status === 'Rechazado') { b.rejected += 1; continue; }
    if (o.status !== 'Entregado') continue;
    b.delivered += 1;
    const pb = platformBreakdownForOrder(o, fallbackRate);
    b.serviceFees += pb.serviceFee;
    b.commissions += pb.commission;
    b.platform += pb.total;
    b.toStores += storeNetForOrder(o, fallbackRate);
    b.toDrivers += driverNetForOrder(o);
    b.revenue += Number(o.total) || 0;
    if (typeof o.createdAtMs === 'number' && typeof o.deliveredAtMs === 'number' && o.deliveredAtMs >= o.createdAtMs) {
      timedMinutes += (o.deliveredAtMs - o.createdAtMs) / 60_000;
      b.deliveryTimedCount += 1;
    }
  }
  b.avgTicket = b.delivered > 0 ? b.revenue / b.delivered : 0;
  b.avgDeliveryMin = b.deliveryTimedCount > 0 ? timedMinutes / b.deliveryTimedCount : null;
  return b;
}

/** Redondea a peso/entero lo que se persiste (los promedios con 1 decimal). */
export function roundDailyBucket(b: DailyBucket): DailyBucket {
  const r = (n: number) => Math.round(n);
  return {
    ...b,
    revenue: r(b.revenue), serviceFees: r(b.serviceFees), commissions: r(b.commissions), refunds: r(b.refunds),
    platform: r(b.platform), toStores: r(b.toStores), toDrivers: r(b.toDrivers),
    avgTicket: r(b.avgTicket),
    avgDeliveryMin: b.avgDeliveryMin === null ? null : Math.round(b.avgDeliveryMin * 10) / 10,
  };
}

/* ───────────── Días en hora ARGENTINA ───────────── */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" del día ARGENTINO al que pertenece un instante. */
export function dayIdART(d: Date | number): string {
  const ms = typeof d === 'number' ? d : d.getTime();
  const art = new Date(ms - ART_OFFSET_H * 3600_000);
  return `${art.getUTCFullYear()}-${pad2(art.getUTCMonth() + 1)}-${pad2(art.getUTCDate())}`;
}

/** Inicio (00:00 ART = 03:00 UTC) del día "YYYY-MM-DD". */
export function dayStartART(id: string): Date {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, ART_OFFSET_H, 0, 0, 0));
}

/** Suma días calendario a un id "YYYY-MM-DD" (negativo = resta). */
export function addDaysId(id: string, days: number): string {
  const [y, m, d] = id.split('-').map(Number);
  return dayIdART(Date.UTC(y, m - 1, d + days, ART_OFFSET_H + 12, 0, 0)); // mediodía ART: sin riesgo de borde
}

/** Lista inclusiva de ids entre dos días (vacía si from > to). Tope defensivo de 1.000 días. */
export function listDayIds(fromId: string, toId: string): string[] {
  const out: string[] = [];
  let cur = fromId;
  while (cur <= toId && out.length < 1000) { out.push(cur); cur = addDaysId(cur, 1); }
  return out;
}

/** "YYYY-MM" del id de día. */
export const monthOfDayId = (id: string): string => id.slice(0, 7);

/** Días en los que una fila "cerrada" se vuelve a calcular en cada corrida (reembolsos retroactivos). */
export const DAILY_RECOMPUTE_DAYS = 35;

/* ───────────── Períodos del Resumen financiero (en ids de día ART) ───────────── */

export type FinancePeriod = '7d' | '30d' | 'month' | 'prevMonth' | 'year';
export const FINANCE_PERIOD_LABELS: Record<FinancePeriod, string> = {
  '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', month: 'Este mes', prevMonth: 'Mes anterior', year: 'Último año',
};

export interface FinancePeriodBounds {
  /** Rango actual, inclusivo. */
  fromId: string; toId: string;
  /** Rango de comparación, inclusivo (null = sin comparación, ej. 'year'). */
  prevFromId: string | null; prevToId: string | null;
  /** ¿El rango actual incluye HOY? (entonces hay que sumar el día en vivo). */
  includesToday: boolean;
  /** Texto corto de contra qué se compara. */
  compareLabel: string | null;
}

const daysInMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = 1-12

/**
 * Límites de cada período en DÍAS CALENDARIO argentinos (no ventanas de 24 h rodantes):
 * 7d = hoy y los 6 anteriores vs los 7 previos; 30d ídem con 30; 'month' = del 1° a hoy vs el
 * MISMO TRAMO del mes pasado (lección OO ter: comparar 7 días contra 31 daba desplomes
 * falsos); 'prevMonth' = el mes pasado completo vs el anterior completo; 'year' = 365 días
 * sin comparación (sería otro año de lecturas).
 */
export function financePeriodBounds(period: FinancePeriod, todayId: string = dayIdART(Date.now())): FinancePeriodBounds {
  const [ty, tm, td] = todayId.split('-').map(Number);
  if (period === '7d' || period === '30d') {
    const n = period === '7d' ? 7 : 30;
    return {
      fromId: addDaysId(todayId, -(n - 1)), toId: todayId,
      prevFromId: addDaysId(todayId, -(2 * n - 1)), prevToId: addDaysId(todayId, -n),
      includesToday: true, compareLabel: `vs los ${n} días anteriores`,
    };
  }
  if (period === 'month') {
    const prevY = tm === 1 ? ty - 1 : ty, prevM = tm === 1 ? 12 : tm - 1;
    const prevDay = Math.min(td, daysInMonth(prevY, prevM));
    return {
      fromId: `${ty}-${pad2(tm)}-01`, toId: todayId,
      prevFromId: `${prevY}-${pad2(prevM)}-01`, prevToId: `${prevY}-${pad2(prevM)}-${pad2(prevDay)}`,
      includesToday: true, compareLabel: 'vs el mismo tramo del mes pasado',
    };
  }
  if (period === 'prevMonth') {
    const pY = tm === 1 ? ty - 1 : ty, pM = tm === 1 ? 12 : tm - 1;
    const ppY = pM === 1 ? pY - 1 : pY, ppM = pM === 1 ? 12 : pM - 1;
    return {
      fromId: `${pY}-${pad2(pM)}-01`, toId: `${pY}-${pad2(pM)}-${pad2(daysInMonth(pY, pM))}`,
      prevFromId: `${ppY}-${pad2(ppM)}-01`, prevToId: `${ppY}-${pad2(ppM)}-${pad2(daysInMonth(ppY, ppM))}`,
      includesToday: false, compareLabel: 'vs el mes anterior a ese',
    };
  }
  return { fromId: addDaysId(todayId, -364), toId: todayId, prevFromId: null, prevToId: null, includesToday: true, compareLabel: null };
}
