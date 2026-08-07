// Tipos de reclamo del comprador (Fase NN) -- lista cerrada, compartida entre el
// diálogo del comprador, /api/claims/create (validación server-side) y /admin/claims.
// Mismo criterio que Rappi/PedidosYa: el reclamo nace estructurado (tipo + pedido +
// evidencia), no como texto libre.

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
