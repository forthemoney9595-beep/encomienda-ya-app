/**
 * Estado de cuenta de una tienda o un repartidor — los MOVIMIENTOS (Fase YY bis). Puro: sin
 * Firestore ni React, así lo usan igual la ficha del admin, la billetera de la tienda y la
 * del repartidor (antes el armado estaba copiado en las dos fichas del admin).
 *
 * Toda la plata sale de money.ts (`storeNetForOrder` / `driverNetForOrder` /
 * `refundSharesForOrder`): el reembolso NO es una fila aparte — ya está descontado del neto
 * del pedido, una fila separada lo restaría dos veces — y se muestra como detalle de la fila
 * con cuánto absorbió la cuenta.
 */
import {
  commissionForOrder, driverNetForOrder, grossSharesForOrder, refundSharesForOrder,
  storeBaseAmount, storeNetForOrder, type MoneyOrder,
} from './money';
import { money } from './format-money';
import { toMillis } from './format-date';

export interface StatementMovement {
  id: string;
  date: unknown; // Timestamp | Date | ms
  label: string;
  detail?: string;
  // Monto con signo: + lo que la cuenta ganó, − lo que se le pagó. Los movimientos con
  // `badge` (solicitud pendiente/rechazada) son informativos: NO mueven los totales.
  amount: number;
  tone: 'in' | 'out' | 'muted';
  badge?: string;
  href?: string;
}

export interface StatementSummary { earned: number; paid: number; requested: number; balance: number; debt: number }

export interface StatementOrder extends MoneyOrder {
  id: string;
  status?: string;
  createdAt?: unknown;
  deliveredAt?: unknown;
  customerName?: string;
  storeName?: string;
}

export interface StatementWithdrawal {
  id: string;
  amount?: number;
  status?: string;
  source?: string;
  operationRef?: string;
  processedAt?: unknown;
  createdAt?: unknown;
  rejectionReason?: string;
}

/** Fecha con la que un pedido entra al estado de cuenta: la de ENTREGA (o la de creación). */
export const statementOrderMs = (o: StatementOrder): number => toMillis(o.deliveredAt) ?? toMillis(o.createdAt) ?? 0;
/** Fecha de un retiro: la del pago si se pagó, si no la de la solicitud. */
export const statementWithdrawalMs = (w: StatementWithdrawal): number =>
  (w.status === 'approved' ? toMillis(w.processedAt) : null) ?? toMillis(w.createdAt) ?? 0;

type Audience = 'admin' | 'self';

/** " · reembolso $X (la tienda absorbió $Y)" — o "(absorbiste $Y)" en la billetera propia. */
function refundDetail(o: StatementOrder, absorbed: number, who: 'tienda' | 'repartidor', audience: Audience): string {
  if (!o.refunded) return '';
  const total = money(o.refundAmount || 0);
  const mine = audience === 'self' ? `absorbiste ${money(absorbed)}` : `${who === 'tienda' ? 'la tienda' : 'el repartidor'} absorbió ${money(absorbed)}`;
  const how = o.refundAllocation ? '' : ' · proporcional';
  return ` · reembolso ${total} (${mine}${how})`;
}

function withdrawalMovements(withdrawals: StatementWithdrawal[], acc: { paid: number; requested: number }): StatementMovement[] {
  const out: StatementMovement[] = [];
  for (const w of withdrawals) {
    const amount = Number(w.amount) || 0;
    if (w.status === 'approved') {
      acc.paid += amount;
      out.push({
        id: `w-${w.id}`, date: w.processedAt || w.createdAt,
        label: w.source === 'auto' ? 'Liquidación pagada' : 'Retiro pagado',
        detail: w.operationRef ? `op ${w.operationRef}` : 'sin comprobante (anterior a que fuera obligatorio)',
        amount: -amount, tone: 'out',
      });
    } else if (w.status === 'pending') {
      acc.requested += amount;
      out.push({
        id: `w-${w.id}`, date: w.createdAt,
        label: w.source === 'auto' ? 'Liquidación generada' : 'Retiro solicitado',
        amount: -amount, tone: 'muted', badge: 'pendiente',
      });
    } else {
      out.push({
        id: `w-${w.id}`, date: w.createdAt,
        label: 'Retiro rechazado', detail: w.rejectionReason || undefined,
        amount: -amount, tone: 'muted', badge: 'rechazado',
      });
    }
  }
  return out;
}

const summaryOf = (earned: number, paid: number, requested: number): StatementSummary => ({
  earned, paid, requested,
  balance: Math.max(0, earned - paid - requested),
  debt: Math.max(0, paid - earned),
});

/** Estado de cuenta de una TIENDA: pedidos entregados netos (money.ts) + retiros. */
export function buildStoreStatement(
  orders: StatementOrder[], withdrawals: StatementWithdrawal[], fallbackRate: number,
  opts: { audience?: Audience; orderHref?: (id: string) => string | undefined } = {},
): { movements: StatementMovement[]; summary: StatementSummary } {
  const audience = opts.audience ?? 'admin';
  const movements: StatementMovement[] = [];
  let earned = 0;
  for (const o of orders) {
    if (o.status !== 'Entregado') continue;
    const net = storeNetForOrder(o, fallbackRate);
    const absorbed = refundSharesForOrder(o, fallbackRate).store;
    earned += net;
    movements.push({
      id: `o-${o.id}`,
      date: o.deliveredAt || o.createdAt,
      label: audience === 'self' ? `Pedido #${o.id.slice(0, 7)} entregado` : `Pedido entregado — ${o.customerName || 'Cliente'}`,
      detail: `venta ${money(storeBaseAmount(o))} · comisión ${commissionForOrder(o, fallbackRate)}%` + refundDetail(o, absorbed, 'tienda', audience),
      amount: net,
      tone: 'in',
      href: opts.orderHref ? opts.orderHref(o.id) : `/orders/${o.id}`,
    });
  }
  const acc = { paid: 0, requested: 0 };
  movements.push(...withdrawalMovements(withdrawals, acc));
  return { movements, summary: summaryOf(earned, acc.paid, acc.requested) };
}

/** Estado de cuenta de un REPARTIDOR: entregas netas (money.ts) + retiros. */
export function buildDriverStatement(
  orders: StatementOrder[], withdrawals: StatementWithdrawal[],
  opts: { audience?: Audience; orderHref?: (id: string) => string | undefined } = {},
): { movements: StatementMovement[]; summary: StatementSummary } {
  const audience = opts.audience ?? 'admin';
  const movements: StatementMovement[] = [];
  let earned = 0;
  for (const o of orders) {
    if (o.status !== 'Entregado') continue;
    const net = driverNetForOrder(o);
    // La tasa no influye en la parte del repartidor; se pasa 0 solo para el desglose.
    const absorbed = refundSharesForOrder(o, 0).driver;
    earned += net;
    movements.push({
      id: `o-${o.id}`,
      date: o.deliveredAt || o.createdAt,
      label: `Entrega — ${o.storeName || 'Tienda'}`,
      detail: `envío ${money(o.deliveryFee || 0)}` + refundDetail(o, absorbed, 'repartidor', audience),
      amount: net,
      tone: 'in',
      href: opts.orderHref ? opts.orderHref(o.id) : `/orders/${o.id}`,
    });
  }
  const acc = { paid: 0, requested: 0 };
  movements.push(...withdrawalMovements(withdrawals, acc));
  return { movements, summary: summaryOf(earned, acc.paid, acc.requested) };
}

/* ───────────── Resumen semanal descargable (CSV) ───────────── */

const r2 = (n: number) => Math.round(n * 100) / 100;
const ART_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Catamarca', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtArt = (ms: number) => ART_FMT.format(new Date(ms)).replace(',', '');

export type CsvRow = Record<string, string | number>;

/**
 * Filas del resumen semanal de una TIENDA: por pedido entregado, venta (productos), envío y
 * tarifa (informativos: no son de la tienda), comisión, reembolso absorbido y neto. Identidad
 * por fila: venta − comisión − reembolso absorbido = neto. La fila TOTAL suma el neto sin
 * redondear por fila (en centavos), así coincide con el "Ganado" del estado de cuenta.
 */
export function storeWeeklyCsvRows(orders: StatementOrder[], fallbackRate: number): { rows: CsvRow[]; totalNet: number } {
  const delivered = orders.filter(o => o.status === 'Entregado').sort((a, b) => statementOrderMs(a) - statementOrderMs(b));
  const rows: CsvRow[] = [];
  const t = { venta: 0, envio: 0, tarifa: 0, comision: 0, reembolso: 0, neto: 0 };
  for (const o of delivered) {
    const g = grossSharesForOrder(o, fallbackRate);
    const venta = storeBaseAmount(o);
    const net = storeNetForOrder(o, fallbackRate);
    const absorbed = g.store - net;
    const row = {
      Fecha: fmtArt(statementOrderMs(o)),
      Pedido: `#${o.id.slice(0, 7)}`,
      'Venta (productos)': r2(venta),
      'Envío (del repartidor)': r2(Number(o.deliveryFee) || 0),
      'Tarifa de servicio (de la plataforma)': r2(Number(o.serviceFee) || 0),
      'Comisión': r2(g.commission),
      'Reembolso absorbido': r2(absorbed),
      'Neto': r2(net),
    };
    t.venta += venta; t.envio += Number(o.deliveryFee) || 0; t.tarifa += Number(o.serviceFee) || 0;
    t.comision += g.commission; t.reembolso += absorbed; t.neto += net;
    rows.push(row);
  }
  rows.push({
    Fecha: 'TOTAL', Pedido: `${delivered.length} pedidos`,
    'Venta (productos)': r2(t.venta), 'Envío (del repartidor)': r2(t.envio), 'Tarifa de servicio (de la plataforma)': r2(t.tarifa),
    'Comisión': r2(t.comision), 'Reembolso absorbido': r2(t.reembolso), 'Neto': r2(t.neto),
  });
  return { rows, totalNet: t.neto };
}

/** Resumen semanal de un REPARTIDOR: solo lo suyo (envío, reembolso absorbido y neto). */
export function driverWeeklyCsvRows(orders: StatementOrder[]): { rows: CsvRow[]; totalNet: number } {
  const delivered = orders.filter(o => o.status === 'Entregado').sort((a, b) => statementOrderMs(a) - statementOrderMs(b));
  const rows: CsvRow[] = [];
  const t = { envio: 0, reembolso: 0, neto: 0 };
  for (const o of delivered) {
    const fee = Number(o.deliveryFee) || 0;
    const net = driverNetForOrder(o);
    rows.push({
      Fecha: fmtArt(statementOrderMs(o)),
      Pedido: `#${o.id.slice(0, 7)}`,
      Tienda: o.storeName || '',
      'Envío': r2(fee),
      'Reembolso absorbido': r2(fee - net),
      'Neto': r2(net),
    });
    t.envio += fee; t.reembolso += fee - net; t.neto += net;
  }
  rows.push({ Fecha: 'TOTAL', Pedido: `${delivered.length} entregas`, Tienda: '', 'Envío': r2(t.envio), 'Reembolso absorbido': r2(t.reembolso), 'Neto': r2(t.neto) });
  return { rows, totalNet: t.neto };
}

/** Pedidos cuya fecha de estado de cuenta cae en [fromMs, toMs). */
export const ordersInRange = <T extends StatementOrder>(orders: T[], fromMs: number, toMs: number): T[] =>
  orders.filter(o => { const ms = statementOrderMs(o); return ms >= fromMs && ms < toMs; });
