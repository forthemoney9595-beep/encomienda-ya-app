import { adminDb } from '@/lib/firebase-admin';
import { storeNetForOrder, driverNetForOrder, FALLBACK_COMMISSION } from '@/lib/money';

// Saldos server-side. Las REGLAS de reparto (qué se le paga a cada uno por un pedido) viven
// en `src/lib/money.ts`, compartidas con las billeteras del cliente para que no vuelvan a
// desincronizarse. Acá solo se consultan las órdenes y los retiros, y se restan.
//
// Comisión por defecto para tiendas sin `commissionRate` propio, leída de
// `config/platform.defaultCommissionRate` (editable en /admin/settings).
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
  /** Lo que el usuario puede pedir hoy. Nunca negativo (ver `debt`). */
  availableBalance: number;
  /** Contra esto se valida la aprobación de un retiro pendiente. */
  approvableBalance: number;
  /**
   * Plata que se le pagó DE MÁS, en positivo (0 si no debe nada).
   *
   * 🚨 Pasa cuando se reembolsa un pedido que ya se había liquidado: el facturado baja por
   * debajo de lo ya transferido. Antes el `Math.max(0, …)` dejaba el saldo en $0 y la deuda
   * quedaba invisible: nadie la veía, al usuario no se le avisaba, y el cron simplemente lo
   * salteaba sin explicar por qué dejó de cobrar. La deuda igual se arrastra (el cálculo es
   * acumulativo y las ventas futuras la absorben), pero ahora se puede VER.
   */
  debt: number;
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

  const totalRevenue = ordersSnap.docs.reduce(
    (sum, d) => sum + storeNetForOrder(d.data(), commissionRate), 0);

  const ownerId = storeSnap.data()?.ownerId;
  if (!ownerId) {
    // Tienda sin dueño: no se le puede atribuir ningún retiro, así que todo lo facturado
    // figura como disponible. (Caso anómalo; queda así para no romper el cálculo.)
    return {
      totalRevenue, withdrawnSettled: 0, withdrawnPending: 0, totalWithdrawn: 0,
      availableBalance: totalRevenue, approvableBalance: totalRevenue, debt: 0, commissionRate,
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
    debt: Math.max(0, settled - totalRevenue),
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

  const totalEarned = ordersSnap.docs.reduce((sum, d) => sum + driverNetForOrder(d.data()), 0);

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
    debt: Math.max(0, settled - totalEarned),
    approvableBalance: Math.max(0, totalEarned - settled),
  };
}
