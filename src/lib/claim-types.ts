// Tipos de reclamo del comprador (Fase NN) -- lista cerrada, compartida entre el
// diálogo del comprador, /api/claims/create (validación server-side) y /admin/claims.
// Mismo criterio que Rappi/PedidosYa: el reclamo nace estructurado (tipo + pedido +
// evidencia), no como texto libre.

import type { RefundPreset } from './money';

export type ClaimType =
  | 'missing_item'   // me faltó un producto (Entregado)
  | 'bad_condition'  // llegó en mal estado (Entregado, exige foto)
  | 'wrong_item'     // me llegó otro producto (Entregado, exige foto)
  | 'not_received'   // figura entregado pero no lo recibí (Entregado)
  | 'stuck_order'    // mi pedido no llega (pagado y sin movimiento > STUCK_CLAIM_MIN_HOURS)
  | 'other';         // otro (Entregado)

export interface ClaimTypeMeta {
  label: string;
  description: string;
  // ¿El comprador tilda qué ítems del pedido están afectados? (precarga el monto parcial)
  itemBased: boolean;
  // Foto obligatoria: solo donde hay algo que fotografiar (el producto en la mano).
  // "Me faltó" / "no llegó" no pueden fotografiar una ausencia -- foto opcional.
  requiresPhoto: boolean;
  // ¿Aparece en pedidos Entregado, o en pedidos pagados trabados en el camino?
  context: 'delivered' | 'stuck';
}

export const CLAIM_TYPES: Record<ClaimType, ClaimTypeMeta> = {
  missing_item: {
    label: 'Me faltó un producto',
    description: 'Recibiste el pedido pero faltan productos que pagaste.',
    itemBased: true,
    requiresPhoto: false,
    context: 'delivered',
  },
  bad_condition: {
    label: 'Llegó en mal estado',
    description: 'El producto llegó roto, volcado, frío o en malas condiciones.',
    itemBased: true,
    requiresPhoto: true,
    context: 'delivered',
  },
  wrong_item: {
    label: 'Me llegó otro producto',
    description: 'Recibiste algo distinto a lo que pediste.',
    itemBased: true,
    requiresPhoto: true,
    context: 'delivered',
  },
  not_received: {
    label: 'Nunca me llegó',
    description: 'El pedido figura como entregado pero no lo recibiste.',
    itemBased: false,
    requiresPhoto: false,
    context: 'delivered',
  },
  stuck_order: {
    label: 'Mi pedido no llega',
    description: 'Pagaste y el pedido está demorado sin avances.',
    itemBased: false,
    requiresPhoto: false,
    context: 'stuck',
  },
  other: {
    label: 'Otro problema',
    description: 'Contanos qué pasó y lo revisamos.',
    itemBased: false,
    requiresPhoto: false,
    context: 'delivered',
  },
};

// Ventana de reclamo post-entrega (horas). El valor real vive en
// config/platform.claimWindowHours (editable en /admin/settings); esto es solo el default.
export const DEFAULT_CLAIM_WINDOW_HOURS = 24;

// "Mi pedido no llega" recién aparece si el pedido pagado lleva más de esto sin
// movimiento -- antes de eso es trabajo del tracking, no de reclamos.
export const STUCK_CLAIM_MIN_HOURS = 1;

// Estados activos donde tiene sentido reclamar que el pedido no avanza (ya hay plata
// del comprador en juego: pagado, sin entregar).
export const STUCK_CLAIMABLE_STATUSES = [
  'En preparación',
  'Listo para recoger',
  'En camino',
  'En reparto',
] as const;

export interface ClaimItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

// Resolución del reclamo (la escribe el servidor: /api/claims/resolve o
// /api/admin/refund-order cuando el reembolso viene de un reclamo).
export type ClaimResolution = 'refunded' | 'rejected' | 'other';

export interface Claim {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  storeId: string | null;
  storeName: string | null;
  type: ClaimType;
  description: string;
  items: ClaimItem[];
  photoPath: string | null;
  suggestedAmount: number | null;
  orderTotal: number;
  // Antifraude (denormalizado al crear): cuántos reclamos previos tiene este comprador
  // y cuántos terminaron en reembolso. El admin lo ve en la ficha del reclamo.
  previousClaims: number;
  previousRefunded: number;
  resolved: boolean;
  resolvedAt?: any;
  resolvedBy?: string;
  resolutionNote?: string;
  resolution?: ClaimResolution;
  refundId?: string;
  createdAt: any;
}

export function toMillis(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return null;
}

// "Último movimiento" del pedido para el umbral de "mi pedido no llega". No hay un
// updatedAt confiable en todos los caminos, así que se toma el timestamp más reciente
// de los que existan (creación, pago/webhook, tomado, retirado).
export function lastMovementMillis(order: {
  createdAt?: any; updatedAt?: any; takenAt?: any; pickedUpAt?: any;
}): number {
  const candidates = [order.createdAt, order.updatedAt, order.takenAt, order.pickedUpAt]
    .map(toMillis)
    .filter((n): n is number => n !== null);
  return candidates.length ? Math.max(...candidates) : 0;
}

/* ───────────── Quién absorbe el reembolso de un reclamo (Fase YY bis) ───────────── */


/**
 * SUGERENCIA por defecto del diálogo de reembolso según el tipo de reclamo. Es solo el
 * preset que aparece marcado: el admin siempre elige y confirma (principio "el dinero
 * nunca sale solo"). Criterio:
 * - faltó / mal estado / producto equivocado: lo armó la tienda → la tienda.
 * - no llegó: la plataforma, de entrada; si después se confirma que el repartidor lo
 *   perdió, el admin elige "El repartidor" (el PIN verificado es la pista, ver abajo).
 * - pedido trabado y otro: sin culpable claro → proporcional (el reparto histórico).
 * Un reembolso SIN reclamo también arranca en proporcional.
 */
export const CLAIM_REFUND_ABSORBER: Record<ClaimType, Exclude<RefundPreset, 'custom'>> = {
  missing_item: 'store',
  bad_condition: 'store',
  wrong_item: 'store',
  not_received: 'platform',
  stuck_order: 'proportional',
  other: 'proportional',
};

export function suggestedRefundPreset(type?: string | null): Exclude<RefundPreset, 'custom'> {
  return (type && CLAIM_REFUND_ABSORBER[type as ClaimType]) || 'proportional';
}

/* ───────────── Señales antifraude (Fase YY bis, punto 8) ───────────── */

// Se calculan en /api/claims/create y se guardan en `claim_risk/{claimId}` — colección
// SOLO admin: el comprador puede leer su propio doc de `claims`, así que las señales no
// pueden vivir ahí. Nunca bloquean nada: el admin decide con el dato a la vista.

export type ClaimRiskCode = 'pin_verified_not_received' | 'new_account' | 'repeat_claims';

export interface ClaimRiskSignal {
  code: ClaimRiskCode;
  label: string;
  detail?: string;
}

/** Cuenta "nueva": creada hace menos de esto. */
export const NEW_ACCOUNT_DAYS = 7;
/** "Reclamos seguidos": esta cantidad de reclamos previos o más dentro de la ventana. */
export const REPEAT_CLAIMS_MIN = 2;
export const REPEAT_CLAIMS_WINDOW_DAYS = 30;

export const CLAIM_RISK_LABELS: Record<ClaimRiskCode, string> = {
  pin_verified_not_received: '"No llegó" con PIN verificado',
  new_account: 'Cuenta nueva',
  repeat_claims: 'Reclamos seguidos',
};

/** Función pura: qué señales levanta un reclamo nuevo. */
export function computeClaimRiskSignals(input: {
  type: string;
  deliveryPinVerified?: boolean | null;
  accountCreatedMs?: number | null;
  nowMs: number;
  previousClaimsInWindow?: number | null;
}): ClaimRiskSignal[] {
  const out: ClaimRiskSignal[] = [];
  if (input.type === 'not_received' && input.deliveryPinVerified === true) {
    out.push({
      code: 'pin_verified_not_received',
      label: CLAIM_RISK_LABELS.pin_verified_not_received,
      detail: 'El repartidor confirmó la entrega con el código que solo tenía el comprador.',
    });
  }
  if (typeof input.accountCreatedMs === 'number' && Number.isFinite(input.accountCreatedMs)) {
    // Tolerancia de 10 min hacia "el futuro": la hora de Auth y el reloj del servidor pueden
    // estar desfasados unos segundos; sin esto una cuenta recién creada daba edad negativa y
    // la señal no salía (lo encontró el QA del 10/11 con el reloj de la PC atrasado ~7 s).
    const ageDays = Math.max(0, (input.nowMs - input.accountCreatedMs) / 86_400_000);
    const skewOk = input.nowMs - input.accountCreatedMs >= -10 * 60_000;
    if (skewOk && ageDays < NEW_ACCOUNT_DAYS) {
      const d = Math.floor(ageDays);
      out.push({
        code: 'new_account',
        label: CLAIM_RISK_LABELS.new_account,
        detail: d === 0 ? 'Creada hoy.' : `Creada hace ${d} día${d === 1 ? '' : 's'}.`,
      });
    }
  }
  const prev = Number(input.previousClaimsInWindow) || 0;
  if (prev >= REPEAT_CLAIMS_MIN) {
    out.push({
      code: 'repeat_claims',
      label: CLAIM_RISK_LABELS.repeat_claims,
      detail: `${prev} reclamos previos en los últimos ${REPEAT_CLAIMS_WINDOW_DAYS} días.`,
    });
  }
  return out;
}
