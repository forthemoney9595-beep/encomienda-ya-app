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
  /**
   * Quién absorbe el reembolso, en pesos (Fase YY bis). Lo escribe SOLO
   * `/api/admin/refund-order`, en la misma transacción que registra el reembolso, y suma
   * `refundAmount`. **Sin el campo = reparto PROPORCIONAL de siempre** (todos los pedidos
   * anteriores a esta fase): su plata no cambia.
   */
  refundAllocation?: RefundAllocation | null;
};

/** Cuánto del reembolso sale del neto de cada parte, en pesos. */
export type RefundAllocation = { store: number; driver: number; platform: number };

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

/**
 * Lo que le toca a cada parte de un pedido ANTES de cualquier reembolso (0 si fue en
 * efectivo). Las tres suman `subtotal + deliveryFee + serviceFee` (= `total`):
 *   tienda     = base − comisión
 *   repartidor = envío
 *   plataforma = tarifa de servicio + comisión
 */
export function grossSharesForOrder(o: MoneyOrder, fallbackRate: number): {
  store: number; driver: number; serviceFee: number; commission: number; platform: number;
} {
  if (!isPlatformCollected(o)) return { store: 0, driver: 0, serviceFee: 0, commission: 0, platform: 0 };
  const base = storeBaseAmount(o);
  const commission = base * (commissionForOrder(o, fallbackRate) / 100);
  const serviceFee = Number(o.serviceFee) || 0;
  return {
    store: Math.max(0, base - commission),
    driver: Number(o.deliveryFee) || 0,
    serviceFee,
    commission,
    platform: serviceFee + commission,
  };
}

/** La asignación guardada, si el pedido está reembolsado y el campo tiene forma válida. */
function storedAllocation(o: MoneyOrder): RefundAllocation | null {
  if (!o.refunded) return null;
  const a = o.refundAllocation;
  if (!a || typeof a !== 'object') return null;
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!ok(a.store) || !ok(a.driver) || !ok(a.platform)) return null;
  return { store: Math.max(0, a.store), driver: Math.max(0, a.driver), platform: Math.max(0, a.platform) };
}

/**
 * Cuánto del reembolso absorbió cada parte (lo que se le DESCONTÓ de su neto), en pesos.
 * Con `refundAllocation` = lo asignado por el admin (nunca más que el bruto de cada parte);
 * sin el campo = proporcional a `refundRatio`, el reparto histórico. Las partes de la
 * plataforma se reparten entre tarifa y comisión en proporción a cada una.
 */
export function refundSharesForOrder(o: MoneyOrder, fallbackRate: number): {
  store: number; driver: number; platform: number; serviceFee: number; commission: number;
} {
  const g = grossSharesForOrder(o, fallbackRate);
  const a = storedAllocation(o);
  if (a && isPlatformCollected(o)) {
    const store = Math.min(g.store, a.store);
    const driver = Math.min(g.driver, a.driver);
    const platform = Math.min(g.platform, a.platform);
    const sfShare = g.platform > 0 ? platform * (g.serviceFee / g.platform) : 0;
    return { store, driver, platform, serviceFee: sfShare, commission: platform - sfShare };
  }
  // Proporcional: se expresa como bruto − neto para que "venta − comisión − absorbido = neto"
  // sea una identidad exacta en estados de cuenta y CSV.
  const keep = 1 - refundRatio(o);
  const sf = g.serviceFee - g.serviceFee * keep;
  const comm = g.commission - g.commission * keep;
  return {
    store: g.store - g.store * keep,
    driver: g.driver - g.driver * keep,
    platform: sf + comm,
    serviceFee: sf,
    commission: comm,
  };
}

/** Lo que le corresponde a la TIENDA por este pedido, ya neto de comisión y reembolsos. */
export function storeNetForOrder(o: MoneyOrder, fallbackRate: number): number {
  if (!isPlatformCollected(o)) return 0;
  const a = storedAllocation(o);
  if (a) {
    const g = grossSharesForOrder(o, fallbackRate);
    return g.store - Math.min(g.store, a.store);
  }
  // Sin asignación: EXACTAMENTE la fórmula de siempre (pedidos históricos idénticos).
  const base = storeBaseAmount(o);
  const rate = commissionForOrder(o, fallbackRate);
  const neto = Math.max(0, base - base * (rate / 100));
  return neto * (1 - refundRatio(o));
}

/** Lo que le corresponde al REPARTIDOR por este pedido (el envío), neto de reembolsos. */
export function driverNetForOrder(o: MoneyOrder): number {
  if (!isPlatformCollected(o)) return 0;
  const fee = Number(o.deliveryFee) || 0;
  const a = storedAllocation(o);
  if (a) return fee - Math.min(fee, a.driver);
  return fee * (1 - refundRatio(o));
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
  if (storedAllocation(o)) {
    // Con asignación: bruto de cada concepto − su parte de lo que absorbió la plataforma.
    const g = grossSharesForOrder(o, fallbackRate);
    const s = refundSharesForOrder(o, fallbackRate);
    const serviceFee = g.serviceFee - s.serviceFee;
    const commission = g.commission - s.commission;
    return { serviceFee, commission, total: serviceFee + commission };
  }
  const keep = 1 - refundRatio(o);
  const serviceFee = (Number(o.serviceFee) || 0) * keep;
  const commission = storeBaseAmount(o) * (commissionForOrder(o, fallbackRate) / 100) * keep;
  return { serviceFee, commission, total: serviceFee + commission };
}

/* ───────────── Quién absorbe un reembolso (Fase YY bis) ───────────── */

/**
 * Presets del diálogo de reembolso. 'proportional' = el reparto histórico (cada parte en
 * proporción a lo que cobró del pedido).
 */
export type RefundPreset = 'proportional' | 'store' | 'driver' | 'platform' | 'custom';

/** Tolerancia de la suma y de los topes de cada parte (los brutos pueden tener centavos). */
export const REFUND_ALLOCATION_TOLERANCE = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;
type Party = keyof RefundAllocation;
const PARTIES: Party[] = ['store', 'driver', 'platform'];

/** Topes: lo máximo que puede absorber cada parte = lo que cobra de ese pedido. */
export function refundAllocationCaps(o: MoneyOrder, fallbackRate: number): RefundAllocation {
  const g = grossSharesForOrder(o, fallbackRate);
  return { store: g.store, driver: g.driver, platform: g.platform };
}

/**
 * Ajusta una asignación para que sume EXACTAMENTE `amount` sin pasarse de ningún tope:
 * recorta a [0, tope] y reparte el residuo (centavos de redondeo, o lo que excede) primero
 * a la plataforma, después a la tienda y al repartidor.
 */
function normalizeAllocation(a: RefundAllocation, caps: RefundAllocation, amount: number): RefundAllocation {
  const out: RefundAllocation = { store: 0, driver: 0, platform: 0 };
  for (const p of PARTIES) out[p] = round2(Math.min(caps[p], Math.max(0, a[p])));
  let residual = round2(amount - (out.store + out.driver + out.platform));
  for (const p of ['platform', 'store', 'driver'] as Party[]) {
    if (Math.abs(residual) < 0.005) break;
    if (residual > 0) {
      const take = round2(Math.min(residual, caps[p] - out[p]));
      if (take > 0) { out[p] = round2(out[p] + take); residual = round2(residual - take); }
    } else {
      const give = round2(Math.min(-residual, out[p]));
      if (give > 0) { out[p] = round2(out[p] - give); residual = round2(residual + give); }
    }
  }
  return out;
}

/**
 * Asignación sugerida para un preset. Si la parte elegida no alcanza (ej. "La tienda" en un
 * reembolso mayor a lo que la tienda cobra del pedido), el EXCEDENTE va a la plataforma; y si
 * tampoco alcanza (reembolso casi total), lo que falta se reparte entre las otras partes en
 * proporción a lo que cobran. `overflow` = lo que no pudo absorber la parte elegida.
 */
export function suggestRefundAllocation(
  o: MoneyOrder, fallbackRate: number, amount: number, preset: Exclude<RefundPreset, 'custom'>,
): { allocation: RefundAllocation; overflow: number } {
  const caps = refundAllocationCaps(o, fallbackRate);
  const amt = Math.max(0, Number(amount) || 0);
  const capTotal = caps.store + caps.driver + caps.platform;
  const target = Math.min(amt, capTotal);

  if (preset === 'proportional') {
    const r = capTotal > 0 ? target / capTotal : 0;
    const raw = { store: caps.store * r, driver: caps.driver * r, platform: caps.platform * r };
    return { allocation: normalizeAllocation(raw, caps, target), overflow: 0 };
  }

  const out: RefundAllocation = { store: 0, driver: 0, platform: 0 };
  out[preset] = Math.min(target, caps[preset]);
  let left = target - out[preset];
  const overflow = left;
  if (left > 0 && preset !== 'platform') {
    const take = Math.min(left, caps.platform);
    out.platform += take; left -= take;
  }
  if (left > 0) {
    const others = PARTIES.filter(p => p !== preset && p !== 'platform');
    const room = others.map(p => caps[p] - out[p]);
    const roomTotal = room.reduce((s, x) => s + x, 0);
    others.forEach((p, i) => { out[p] += roomTotal > 0 ? left * (room[i] / roomTotal) : 0; });
  }
  return { allocation: normalizeAllocation(out, caps, target), overflow: round2(overflow) };
}

/**
 * Valida una asignación contra un pedido y un monto (la usan el diálogo y la ruta, idénticas):
 * cada parte ≥ 0, la tienda ≤ su neto bruto (base − comisión), el repartidor ≤ envío, la
 * plataforma ≤ tarifa + comisión, y la suma = monto (tolerancia $1). Si pasa, devuelve la
 * asignación NORMALIZADA (suma exacta, ninguna parte sobre su tope) — esa es la que se guarda.
 */
export function validateRefundAllocation(
  o: MoneyOrder, fallbackRate: number, amount: number, allocation: Partial<RefundAllocation> | null | undefined,
): { ok: true; allocation: RefundAllocation } | { ok: false; error: string } {
  if (!isPlatformCollected(o)) return { ok: false, error: 'Pedido en efectivo: la plataforma no cobró nada que repartir.' };
  if (!allocation || typeof allocation !== 'object') return { ok: false, error: 'Falta decir quién absorbe el reembolso.' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Monto de reembolso inválido.' };
  const a = {} as RefundAllocation;
  for (const p of PARTIES) {
    const v = Number(allocation[p] ?? 0);
    if (!Number.isFinite(v)) return { ok: false, error: 'Los montos de la asignación tienen que ser números.' };
    if (v < 0) return { ok: false, error: 'Ninguna parte puede absorber un monto negativo.' };
    a[p] = v;
  }
  const caps = refundAllocationCaps(o, fallbackRate);
  const T = REFUND_ALLOCATION_TOLERANCE;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
  if (a.store > caps.store + T) return { ok: false, error: `La tienda puede absorber como máximo ${fmt(caps.store)} de este pedido (lo que cobra, ya sin comisión).` };
  if (a.driver > caps.driver + T) return { ok: false, error: `El repartidor puede absorber como máximo ${fmt(caps.driver)} (el envío).` };
  if (a.platform > caps.platform + T) return { ok: false, error: `La plataforma puede absorber como máximo ${fmt(caps.platform)} (tarifa + comisión de este pedido).` };
  const total = a.store + a.driver + a.platform;
  if (Math.abs(total - amt) > T) return { ok: false, error: `La asignación suma ${fmt(total)} y el reembolso es de ${fmt(amt)}: tienen que coincidir.` };
  return { ok: true, allocation: normalizeAllocation(a, caps, Math.min(amt, caps.store + caps.driver + caps.platform)) };
}
