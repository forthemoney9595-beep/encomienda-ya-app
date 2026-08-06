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
  if (!isPlatformCollected(o)) return 0;
  const base = storeBaseAmount(o);
  const rate = commissionForOrder(o, fallbackRate);
  const bruto = (Number(o.serviceFee) || 0) + base * (rate / 100);
  return bruto * (1 - refundRatio(o));
}
