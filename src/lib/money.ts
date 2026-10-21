/**
 * Reglas de reparto del dinero de un pedido. FUENTE DE VERDAD ÚNICA.
 *
 * Por qué existe este archivo: la fórmula de saldo estaba escrita TRES veces —
 * `payout-service.ts` (servidor, la que decide cuánto se aprueba), `my-store/wallet`
 * (lo que ve la tienda) y `delivery/earnings` (lo que ve el repartidor). Cada vez que se
 * corregía una, las otras quedaban desincronizadas: la tienda llegó a ver $1.646.253
 * disponibles mientras el servidor solo aprobaba $1.123.406, y el retiro le rebotaba sin
 * explicación. Estas funciones son puras (no tocan Firestore) justamente para que las
 * pueda importar tanto el cliente como el Admin SDK.
 *
 * **Si cambia el reparto, se cambia acá y en ningún otro lado.**
 *
 * Reparto de un pedido de $10.000 en productos + $2.000 de envío + 5% de tarifa:
 *   cliente paga $12.500
 *   → repartidor: $2.000 (deliveryFee)
 *   → plataforma: $500 (serviceFee) + comisión sobre los $10.000
 *   → tienda:     $10.000 − comisión
 */

export type MoneyOrder = {
  total?: number;
  subtotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  paymentMethod?: string;
  refunded?: boolean;
  refundAmount?: number;
  commissionRate?: number;
};

/** Comisión por defecto si no hay ninguna configurada. Preferible cobrar de más y ajustar. */
export const FALLBACK_COMMISSION = 10;

/**
 * Defaults de la plataforma cuando `config/platform` no tiene el campo. ARQ-008 (auditoría
 * oct 2026): estaban duplicados en `create` y `confirm-stock` (`DEFAULT_DELIVERY_FEE = 2000`
 * y `serviceFee ?? 5` ×2) — un cambio en uno descuadraba el otro.
 */
export const PLATFORM_DEFAULTS = {
  serviceFeePercent: 5,
  deliveryFee: 2000,
  commissionRate: FALLBACK_COMMISSION,
} as const;

/**
 * Composición del TOTAL de un pedido — la ÚNICA fórmula. La usan `/api/orders/create` (al
 * nacer el pedido) y `/api/orders/confirm-stock` (al sacar/ajustar ítems); antes cada una
 * la tenía escrita aparte y `commissionAmount` se recalculaba a mano.
 *   total = subtotal + deliveryFee + serviceFee(subtotal × %)
 *   commissionAmount = subtotal × commissionRate %   (congelada en el pedido)
 */
export function composeOrderTotals(input: {
  subtotal: number;
  deliveryFee: number;
  serviceFeePercent: number;
  commissionRate: number;
}): { subtotal: number; deliveryFee: number; serviceFee: number; total: number; commissionRate: number; commissionAmount: number } {
  const subtotal = Math.max(0, Number(input.subtotal) || 0);
  const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0);
  const serviceFeePercent = Math.max(0, Number(input.serviceFeePercent) || 0);
  const commissionRate = Math.max(0, Number(input.commissionRate) || 0);
  const serviceFee = (subtotal * serviceFeePercent) / 100;
  return {
    subtotal,
    deliveryFee,
    serviceFee,
    total: subtotal + deliveryFee + serviceFee,
    commissionRate,
    commissionAmount: (subtotal * commissionRate) / 100,
  };
}

/**
 * ¿La plataforma cobró esta plata? En efectivo el repartidor cobra el total EN MANO, así
 * que ese dinero nunca entró y no se le puede acreditar a nadie. Hoy la app es solo
 * digital; esto protege pedidos históricos.
 */
export const isPlatformCollected = (o: MoneyOrder): boolean => o.paymentMethod !== 'Efectivo';

/**
 * Base sobre la que se le paga a la tienda: el valor de SUS productos, nada más.
 * El `serviceFee` es de la plataforma y NO entra acá (antes sí: se usaba
 * `total - deliveryFee`, o sea que se le regalaba a la tienda el 90% de la tarifa que
 * pagaba el comprador). El fallback cubre pedidos viejos sin `subtotal`.
 */
export const storeBaseAmount = (o: MoneyOrder): number => {
  if (typeof o.subtotal === 'number' && o.subtotal > 0) return o.subtotal;
  return Math.max(0, (Number(o.total) || 0) - (Number(o.deliveryFee) || 0) - (Number(o.serviceFee) || 0));
};

/** Proporción del pedido que se devolvió al comprador (0 = nada, 1 = todo). */
export const refundRatio = (o: MoneyOrder): number => {
  if (!o.refunded) return 0;
  const total = Number(o.total) || 0;
  const refunded = Number(o.refundAmount) || 0;
  if (total <= 0) return 1; // sin total conocido, se anula el pedido entero
  return Math.min(1, Math.max(0, refunded / total));
};

/** Comisión aplicable: la congelada en el pedido, o la vigente para pedidos anteriores. */
export const commissionForOrder = (o: MoneyOrder, fallbackRate: number): number =>
  typeof o.commissionRate === 'number' ? o.commissionRate : fallbackRate;

/** Lo que le corresponde a la TIENDA por este pedido, ya neto de comisión y reembolsos. */
export function storeNetForOrder(o: MoneyOrder, fallbackRate: number): number {
  if (!isPlatformCollected(o)) return 0;
  const base = storeBaseAmount(o);
  const rate = commissionForOrder(o, fallbackRate);
  const neto = Math.max(0, base - base * (rate / 100));
  return neto * (1 - refundRatio(o));
}

/** Lo que le corresponde al REPARTIDOR por este pedido (el envío), neto de reembolsos. */
export function driverNetForOrder(o: MoneyOrder): number {
  if (!isPlatformCollected(o)) return 0;
  return (Number(o.deliveryFee) || 0) * (1 - refundRatio(o));
}

/** Lo que retiene la PLATAFORMA: tarifa de servicio + comisión de la tienda. */
export function platformNetForOrder(o: MoneyOrder, fallbackRate: number): number {
  return platformBreakdownForOrder(o, fallbackRate).total;
}

/**
 * Lo que gana la plataforma en un pedido, DESGLOSADO: tarifa de servicio + comisión a la
 * tienda, ambas netas de reembolsos y 0 si fue en efectivo. ARQ-009 (auditoría oct 2026):
 * este desglose estaba recompuesto a mano en 4 lugares (dashboard admin, ficha de tienda,
 * Ganancias de Finanzas y los cierres mensuales) — ahora todos leen de acá, y
 * `platformNetForOrder` es simplemente `total`.
 */
export function platformBreakdownForOrder(o: MoneyOrder, fallbackRate: number): { serviceFee: number; commission: number; total: number } {
  if (!isPlatformCollected(o)) return { serviceFee: 0, commission: 0, total: 0 };
  const keep = 1 - refundRatio(o);
  const serviceFee = (Number(o.serviceFee) || 0) * keep;
  const commission = storeBaseAmount(o) * (commissionForOrder(o, fallbackRate) / 100) * keep;
  return { serviceFee, commission, total: serviceFee + commission };
}
