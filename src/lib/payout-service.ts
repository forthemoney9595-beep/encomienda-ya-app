import { adminDb } from '@/lib/firebase-admin';

// Fórmula centralizada de saldo disponible — reemplaza el cálculo duplicado que vivía
// por separado en my-store/wallet/page.tsx y delivery/earnings/page.tsx, y ahora también
// se usa server-side en /api/admin/approve-withdrawal para validar antes de aprobar.
//
// 🔒 SOLO CUENTA PLATA QUE ENTRÓ A LA PLATAFORMA (ago 2026).
// Un pedido en efectivo lo cobra el repartidor EN MANO: esa plata nunca pasa por la
// plataforma. Sin este filtro, el saldo acreditaba igual el envío al repartidor Y su parte
// a la tienda, o sea que la plataforma terminaba pagando de su bolsillo por un pedido del
// que no recibió un peso (y encima el repartidor ya se había quedado con el total).
// La app hoy solo acepta pago digital (ver ALLOWED_PAYMENT_METHODS en /api/orders/create),
// pero este filtro protege el cálculo ante cualquier pedido histórico o futuro en efectivo.
// Si algún día se reactiva el efectivo, hay que modelar la RENDICIÓN del repartidor
// (descontar de su saldo lo que cobró), no simplemente volver a incluirlos acá.
const isPlatformCollected = (o: FirebaseFirestore.DocumentData) => o.paymentMethod !== 'Efectivo';

// 🔒 REEMBOLSOS (ago 2026). `/api/admin/refund-order` marca el pedido con `refunded` y
// `refundAmount`, pero el saldo sumaba igual el pedido completo: si el admin devolvía la
// plata al comprador, la tienda/repartidor la cobraban lo mismo y la plataforma pagaba dos
// veces. Se descuenta proporcionalmente sobre lo que le tocaba a cada parte, usando el
// campo que ya vive en la propia orden (sin una query extra a `refunds`).
const refundRatio = (o: FirebaseFirestore.DocumentData) => {
  if (!o.refunded) return 0;
  const total = Number(o.total) || 0;
  const refunded = Number(o.refundAmount) || 0;
  if (total <= 0) return 1;                       // sin total conocido: se anula entero
  return Math.min(1, Math.max(0, refunded / total));
};

// Comisión por defecto para tiendas sin `commissionRate` propio, leída de
// `config/platform.defaultCommissionRate` (editable en /admin/settings). El fallback duro
// es 10%: preferible cobrar de más y corregir, a regalar la comisión en silencio.
const FALLBACK_COMMISSION = 10;
async function getDefaultCommission(): Promise<number> {
  try {
    const cfg = await adminDb.collection('config').doc('platform').get();
    const v = cfg.data()?.defaultCommissionRate;
    return typeof v === 'number' && v >= 0 ? v : FALLBACK_COMMISSION;
  } catch {
    return FALLBACK_COMMISSION;
  }
}

/**
 * Los dos saldos que hay que distinguir, y por qué:
 *
 * - `availableBalance` = facturado − (retiros aprobados + retiros PENDIENTES).
 *   Es lo que el usuario puede PEDIR. Descuenta lo pendiente para que no pida dos veces
 *   la misma plata.
 *
 * - `approvableBalance` = facturado − retiros APROBADOS solamente.
 *   Es contra lo que hay que validar cuando el admin APRUEBA un retiro puntual, porque ese
 *   retiro todavía está `pending` y ya estaría restado de `availableBalance`.
 *
 * 🚨 Este era el bug: `approve-withdrawal` validaba el monto contra `availableBalance`, que
 * ya incluía el propio retiro que se estaba aprobando. Con facturado 10.000 y un pedido de
 * 10.000: available = 10.000 − 10.000 = 0 → "supera el saldo real disponible ($0)". O sea
 * NINGÚN retiro por el saldo completo era aprobable, y como el cron genera exactamente eso
 * (`Math.floor(availableBalance)`), TODA liquidación automática quedaba inaprobable.
 */
export type BalanceResult = {
  totalRevenue: number;
  /** Retiros ya transferidos (status 'approved'). */
  withdrawnSettled: number;
  /** Retiros solicitados y todavía sin procesar (status 'pending'). */
  withdrawnPending: number;
  /** Compat: settled + pending. Lo que históricamente se llamaba "totalWithdrawn". */
  totalWithdrawn: number;
  /** Lo que el usuario puede pedir hoy. */
  availableBalance: number;
  /** Contra esto se valida la aprobación de un retiro pendiente. */
  approvableBalance: number;
};

/** Suma retiros por estado. `rejected` no cuenta: esa plata volvió al saldo. */
function splitWithdrawals(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  let settled = 0, pending = 0;
  for (const d of docs) {
    const w = d.data();
    const amount = Number(w.amount) || 0;
    if (w.status === 'approved') settled += amount;
    else if (w.status === 'pending') pending += amount;
  }
  return { settled, pending };
}

export async function computeStoreBalance(storeId: string): Promise<BalanceResult & {
  commissionRate: number;
}> {
  const storeSnap = await adminDb.collection('stores').doc(storeId).get();
  // Comisión: la de la tienda si la tiene; si no, la global de `config/platform`.
  // Antes caía en `|| 0`, o sea que una tienda dada de alta sin comisión explícita operaba
  // GRATIS para siempre sin que nadie lo notara (había 5 de 21 así). El default global es
  // editable desde /admin/settings.
  const storeRate = storeSnap.data()?.commissionRate;
  const commissionRate: number = typeof storeRate === 'number' && storeRate > 0
    ? storeRate
    : await getDefaultCommission();

  const ordersSnap = await adminDb.collection('orders')
    .where('storeId', '==', storeId)
    .where('status', '==', 'Entregado')
    .get();

  const totalRevenue = ordersSnap.docs.reduce((sum, d) => {
    const o = d.data();
    if (!isPlatformCollected(o)) return sum; // pagado en mano al repartidor
    const productTotal = (o.total || 0) - (o.deliveryFee || 0);
    const commission = productTotal * (commissionRate / 100);
    const neto = Math.max(0, productTotal - commission);
    return sum + neto * (1 - refundRatio(o));
  }, 0);

  const ownerId = storeSnap.data()?.ownerId;
  if (!ownerId) {
    // Tienda sin dueño: no se le puede atribuir ningún retiro, así que todo lo facturado
    // figura como disponible. (Caso anómalo; queda así para no romper el cálculo.)
    return {
      totalRevenue, withdrawnSettled: 0, withdrawnPending: 0, totalWithdrawn: 0,
      availableBalance: totalRevenue, approvableBalance: totalRevenue, commissionRate,
    };
  }

  const withdrawalsSnap = await adminDb.collection('withdrawals')
    .where('userId', '==', ownerId)
    .where('userRole', '==', 'store')
    .get();

  const { settled, pending } = splitWithdrawals(withdrawalsSnap.docs);

  return {
    totalRevenue,
    withdrawnSettled: settled,
    withdrawnPending: pending,
    totalWithdrawn: settled + pending,
    availableBalance: Math.max(0, totalRevenue - settled - pending),
    approvableBalance: Math.max(0, totalRevenue - settled),
    commissionRate,
  };
}

export async function computeDriverBalance(driverUserId: string): Promise<
  Omit<BalanceResult, 'totalRevenue'> & { totalEarned: number }
> {
  const ordersSnap = await adminDb.collection('orders')
    .where('deliveryPersonId', '==', driverUserId)
    .where('status', '==', 'Entregado')
    .get();

  const totalEarned = ordersSnap.docs.reduce((sum, d) => {
    const o = d.data();
    if (!isPlatformCollected(o)) return sum; // ya cobró el envío en mano junto con el total
    return sum + (o.deliveryFee || 0) * (1 - refundRatio(o));
  }, 0);

  const withdrawalsSnap = await adminDb.collection('withdrawals')
    .where('userId', '==', driverUserId)
    .where('userRole', '==', 'delivery')
    .get();

  const { settled, pending } = splitWithdrawals(withdrawalsSnap.docs);

  return {
    totalEarned,
    withdrawnSettled: settled,
    withdrawnPending: pending,
    totalWithdrawn: settled + pending,
    availableBalance: Math.max(0, totalEarned - settled - pending),
    approvableBalance: Math.max(0, totalEarned - settled),
  };
}
