// Pedidos "trabados": cuánto puede estar un pedido en cada estado activo antes de alertar.
// Función PURA compartida por el Resumen y la Bandeja del admin (Tanda T1). Antes vivía
// dentro de admin/page.tsx y el "hace Xh" no avanzaba porque el memo dependía solo del
// listener (el llamador pasa `now` y lo renueva con un intervalo).
import { toMillis } from './format-date';

/** Estados activos = pedidos en curso ahora (set chico por naturaleza → se escuchan en vivo). */
export const ADMIN_ACTIVE_STATUSES = [
  'Pendiente de Confirmación',
  'Pendiente de Pago',
  'En preparación',
  'Listo para recoger',
  'En camino',
  'En reparto',
] as const;

export type ActiveStatus = (typeof ADMIN_ACTIVE_STATUSES)[number];

/** Umbrales en horas por estado. */
export const STUCK_THRESHOLDS_H: Record<string, number> = {
  'Pendiente de Confirmación': 1, // la tienda debería confirmar en ≤1h
  'Pendiente de Pago': 2,         // el cliente debería pagar en ≤2h
  'En preparación': 3,            // la tienda debería tenerlo listo en ≤3h
  'Listo para recoger': 2,        // un repartidor debería tomarlo en ≤2h
  'En camino': 3,                 // el repartidor debería retirarlo en ≤3h
  'En reparto': 4,
};

export const STUCK_RULE_TEXT =
  'Un pedido se marca trabado según su estado: confirmación ≥1h · pago ≥2h · preparación ≥3h · retiro ≥2h · entrega ≥3h · reparto ≥4h';

export interface StuckSource {
  id: string;
  status: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  takenAt?: unknown;
  pickedUpAt?: unknown;
  paidAt?: unknown;
}

export interface StuckOrder<T extends StuckSource = StuckSource> {
  order: T;
  /** Milisegundos desde el último movimiento conocido. */
  elapsedMs: number;
  hours: number;
}

/** "Último movimiento": el timestamp más reciente de los que existan en el doc. */
export function lastMovementMs(o: StuckSource): number | null {
  const candidates = [o.createdAt, o.updatedAt, o.takenAt, o.pickedUpAt, o.paidAt]
    .map(toMillis)
    .filter((n): n is number => n !== null);
  return candidates.length ? Math.max(...candidates) : null;
}

/** Devuelve los pedidos activos que superaron su umbral, del más viejo al más nuevo. */
export function computeStuckOrders<T extends StuckSource>(orders: T[], now: number = Date.now()): StuckOrder<T>[] {
  const out: StuckOrder<T>[] = [];
  for (const o of orders) {
    const threshold = STUCK_THRESHOLDS_H[o.status];
    if (!threshold) continue;
    const last = lastMovementMs(o);
    if (last === null) continue;
    const elapsedMs = now - last;
    const hours = elapsedMs / 3_600_000;
    if (hours >= threshold) out.push({ order: o, elapsedMs, hours });
  }
  return out.sort((a, b) => b.elapsedMs - a.elapsedMs);
}
