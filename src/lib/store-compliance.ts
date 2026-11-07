// Cumplimiento del comercio (Fase YY, punto 4 de "Cómo administran Rappi y PedidosYa").
// Funciones PURAS: las usan la Bandeja del admin, la ficha admin de la tienda y el dashboard
// de la propia tienda. Sin penalizaciones automáticas: solo se mide y se avisa.
//
// La fuente es `orders.storeDecision` ('confirmed' | 'rejected' | 'timeout') +
// `storeDecisionAt`, que escriben server-side confirm-stock, reject y la cancelación
// automática. Pedidos anteriores a la Fase YY no lo tienen: las métricas cuentan desde ahí.
import { toMillis } from './format-date';

/**
 * Alerta de la Bandeja: una tienda con ESTA cantidad de pedidos rechazados o no confirmados
 * a tiempo dentro de la ventana. 3 en 30 min es el umbral que la prensa le atribuye a
 * PedidosYa (no publicado oficialmente): a la escala de Tinogasta, 3 seguidos ya es una
 * tienda que no está atendiendo y conviene pausarla antes de que siga frustrando clientes.
 */
export const STORE_ALERT_THRESHOLD = 3;
export const STORE_ALERT_WINDOW_MIN = 30;

export type StoreDecision = 'confirmed' | 'rejected' | 'timeout';
export const FAILED_DECISIONS: StoreDecision[] = ['rejected', 'timeout'];

export interface DecisionRow {
  id: string;
  storeId?: string;
  storeName?: string;
  storeDecision?: string;
  storeDecisionAt?: unknown;
}

export interface StoreAlert {
  storeId: string;
  storeName: string;
  rejected: number;
  timeouts: number;
  total: number;
  /** Último fallo dentro de la ventana (ms). */
  lastAt: number;
  orderIds: string[];
}

/** Agrupa los fallos de los últimos STORE_ALERT_WINDOW_MIN minutos y devuelve las tiendas que llegan al umbral. */
export function computeStoreAlerts(rows: DecisionRow[], now: number = Date.now()): StoreAlert[] {
  const from = now - STORE_ALERT_WINDOW_MIN * 60_000;
  const byStore = new Map<string, StoreAlert>();
  for (const r of rows) {
    if (!r.storeId) continue;
    if (r.storeDecision !== 'rejected' && r.storeDecision !== 'timeout') continue;
    const at = toMillis(r.storeDecisionAt);
    if (at === null || at < from || at > now + 60_000) continue;
    const a = byStore.get(r.storeId) ?? { storeId: r.storeId, storeName: r.storeName || 'Tienda', rejected: 0, timeouts: 0, total: 0, lastAt: 0, orderIds: [] };
    if (r.storeDecision === 'rejected') a.rejected++; else a.timeouts++;
    a.total++;
    a.lastAt = Math.max(a.lastAt, at);
    a.orderIds.push(r.id);
    byStore.set(r.storeId, a);
  }
  return [...byStore.values()].filter(a => a.total >= STORE_ALERT_THRESHOLD).sort((x, y) => y.total - x.total || y.lastAt - x.lastAt);
}

/** Tasa de aceptación en % (0-100) sobre los pedidos que la tienda tuvo que decidir. null = sin datos. */
export function acceptanceRate(confirmed: number | null, rejected: number | null, timeouts: number | null): number | null {
  if (confirmed === null || rejected === null || timeouts === null) return null;
  const decided = confirmed + rejected + timeouts;
  if (decided === 0) return null;
  return Math.round((confirmed / decided) * 1000) / 10;
}

/** "2 min 30 s" / "45 s" para el tiempo promedio de confirmación. */
export function fmtConfirmSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—';
  const total = Math.round(s);
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  const rest = total % 60;
  return rest > 0 ? `${m} min ${rest} s` : `${m} min`;
}
