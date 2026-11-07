import { describe, it, expect } from 'vitest';
import {
  isPlatformCollected,
  storeBaseAmount,
  refundRatio,
  commissionForOrder,
  storeNetForOrder,
  driverNetForOrder,
  platformNetForOrder,
  FALLBACK_COMMISSION,
  type MoneyOrder,
} from './money';

// Pedido de referencia del propio módulo: $10.000 productos + $2.000 envío + $500 tarifa (5%).
// El comprador paga $12.500; comisión de tienda 10%.
const REF: MoneyOrder = {
  total: 12500, subtotal: 10000, deliveryFee: 2000, serviceFee: 500,
  paymentMethod: 'mercadopago', commissionRate: 10,
};

describe('money.ts — invariante de reparto', () => {
  it('la SUMA de las tres partes = lo que pagó el cliente (menos reembolsos)', () => {
    const store = storeNetForOrder(REF, FALLBACK_COMMISSION);
    const driver = driverNetForOrder(REF);
    const platform = platformNetForOrder(REF, FALLBACK_COMMISSION);
    // total = subtotal + deliveryFee + serviceFee, sin reembolso → suma exacta
    expect(store + driver + platform).toBeCloseTo(REF.total!, 6);
  });

  it('el reparto concreto del ejemplo del módulo', () => {
    expect(driverNetForOrder(REF)).toBe(2000);                       // el envío entero
    expect(storeNetForOrder(REF, 10)).toBe(9000);                    // 10.000 − 10%
    expect(platformNetForOrder(REF, 10)).toBe(1500);                 // 500 tarifa + 1000 comisión
  });

  it('el invariante se sostiene con un reembolso parcial', () => {
    const o: MoneyOrder = { ...REF, refunded: true, refundAmount: 2500 }; // 20%
    const suma = storeNetForOrder(o, 10) + driverNetForOrder(o) + platformNetForOrder(o, 10);
    expect(suma).toBeCloseTo(REF.total! - 2500, 6); // = total − reembolsado
    expect(refundRatio(o)).toBeCloseTo(0.2, 6);
  });
});

describe('money.ts — efectivo (excluido)', () => {
  it('un pedido en Efectivo NO acredita nada a nadie (el repartidor cobró en mano)', () => {
    const cash: MoneyOrder = { ...REF, paymentMethod: 'Efectivo' };
    expect(isPlatformCollected(cash)).toBe(false);
    expect(storeNetForOrder(cash, 10)).toBe(0);
    expect(driverNetForOrder(cash)).toBe(0);
    expect(platformNetForOrder(cash, 10)).toBe(0);
  });
  it('cualquier método que no sea Efectivo se cuenta como cobrado', () => {
    expect(isPlatformCollected({ paymentMethod: 'mercadopago' })).toBe(true);
    expect(isPlatformCollected({})).toBe(true); // sin método = digital por defecto
  });
});

describe('money.ts — storeBaseAmount', () => {
  it('usa el subtotal cuando existe (la tarifa de servicio NO es de la tienda)', () => {
    expect(storeBaseAmount(REF)).toBe(10000);
  });
  it('fallback para pedidos viejos sin subtotal: total − envío − tarifa', () => {
    expect(storeBaseAmount({ total: 12500, deliveryFee: 2000, serviceFee: 500 })).toBe(10000);
  });
  it('nunca negativo', () => {
    expect(storeBaseAmount({ total: 100, deliveryFee: 2000, serviceFee: 500 })).toBe(0);
  });
});

describe('money.ts — refundRatio (clamp 0..1)', () => {
  it('sin reembolso = 0', () => expect(refundRatio({ ...REF, refunded: false })).toBe(0));
  it('reembolso total = 1', () => expect(refundRatio({ total: 100, refunded: true, refundAmount: 100 })).toBe(1));
  it('reembolso mayor al total se clampa a 1', () => expect(refundRatio({ total: 100, refunded: true, refundAmount: 999 })).toBe(1));
  it('refunded sin total conocido anula el pedido entero (ratio 1)', () => expect(refundRatio({ refunded: true, refundAmount: 50 })).toBe(1));
  it('un refundAmount negativo no da ratio negativo', () => expect(refundRatio({ total: 100, refunded: true, refundAmount: -50 })).toBe(0));
});

describe('money.ts — comisión', () => {
  it('usa la comisión CONGELADA del pedido si está', () => {
    expect(commissionForOrder({ commissionRate: 15 }, 10)).toBe(15);
    expect(commissionForOrder({ commissionRate: 0 }, 10)).toBe(0); // 0% es válido y explícito
  });
  it('usa el fallback si el pedido no tiene comisión congelada', () => {
    expect(commissionForOrder({}, 10)).toBe(10);
  });
  it('comisión al 100% deja la tienda en 0, sin negativos', () => {
    expect(storeNetForOrder({ ...REF, commissionRate: 100 }, 10)).toBe(0);
  });
});

describe('money.ts — robustez ante datos parciales', () => {
  it('un pedido vacío no rompe ni da NaN', () => {
    expect(storeNetForOrder({}, 10)).toBe(0);
    expect(driverNetForOrder({})).toBe(0);
    expect(platformNetForOrder({}, 10)).toBe(0);
  });
});

// ARQ-008 (auditoría oct 2026): la composición del total vive en money.ts y la comparten
// /api/orders/create y /api/orders/confirm-stock.
import { composeOrderTotals, PLATFORM_DEFAULTS } from './money';

describe('composeOrderTotals — una sola fórmula del total', () => {
  it('total = subtotal + envío + tarifa(%) y la comisión se congela sobre el subtotal', () => {
    const t = composeOrderTotals({ subtotal: 10000, deliveryFee: 2000, serviceFeePercent: 5, commissionRate: 10 });
    expect(t.serviceFee).toBe(500);
    expect(t.total).toBe(12500);
    expect(t.commissionAmount).toBe(1000);
    expect(t.total).toBe(t.subtotal + t.deliveryFee + t.serviceFee);
  });
  it('coincide con el pedido de referencia del módulo (REF) y con las funciones de reparto', () => {
    const t = composeOrderTotals({ subtotal: REF.subtotal!, deliveryFee: REF.deliveryFee!, serviceFeePercent: 5, commissionRate: REF.commissionRate! });
    expect(t.total).toBe(REF.total);
    expect(t.serviceFee).toBe(REF.serviceFee);
    // commissionForOrder devuelve la TASA (%); el monto es subtotal × tasa / 100.
    expect(t.commissionAmount).toBe((REF.subtotal! * commissionForOrder(REF, FALLBACK_COMMISSION)) / 100);
  });
  it('sacar ítems en confirm-stock solo puede BAJAR el total (subtotal menor, mismo envío)', () => {
    const antes = composeOrderTotals({ subtotal: 11550, deliveryFee: 2100, serviceFeePercent: 5, commissionRate: 10 });
    const despues = composeOrderTotals({ subtotal: 5500, deliveryFee: 2100, serviceFeePercent: 5, commissionRate: 10 });
    expect(despues.total).toBeLessThan(antes.total);
    expect(despues.deliveryFee).toBe(antes.deliveryFee);
    expect(despues.commissionAmount).toBe(550);
  });
  it('tolera basura: negativos y NaN se tratan como 0, nunca un total negativo', () => {
    const t = composeOrderTotals({ subtotal: -5, deliveryFee: NaN as any, serviceFeePercent: -1, commissionRate: undefined as any });
    expect(t.total).toBe(0);
    expect(t.commissionAmount).toBe(0);
  });
  it('los defaults de la plataforma son los históricos ($2.000 envío, 5 %, comisión 10 %)', () => {
    expect(PLATFORM_DEFAULTS.deliveryFee).toBe(2000);
    expect(PLATFORM_DEFAULTS.serviceFeePercent).toBe(5);
    expect(PLATFORM_DEFAULTS.commissionRate).toBe(FALLBACK_COMMISSION);
  });
});

// ARQ-009: el desglose de la ganancia de la plataforma (tarifa + comisión) tiene una sola fuente.
import { platformBreakdownForOrder } from './money';

describe('platformBreakdownForOrder — desglose único de lo que gana la app', () => {
  it('tarifa + comisión = platformNetForOrder, y con el pedido de referencia da $500 + $1.000', () => {
    const b = platformBreakdownForOrder(REF, FALLBACK_COMMISSION);
    expect(b.serviceFee).toBe(500);
    expect(b.commission).toBe(1000);
    expect(b.total).toBe(platformNetForOrder(REF, FALLBACK_COMMISSION));
  });
  it('un reembolso del 50 % descuenta la mitad de las DOS partes', () => {
    const half = { ...REF, refunded: true, refundAmount: REF.total! / 2 };
    const b = platformBreakdownForOrder(half, FALLBACK_COMMISSION);
    expect(b.serviceFee).toBeCloseTo(250);
    expect(b.commission).toBeCloseTo(500);
  });
  it('en efectivo la plataforma no cobró nada: todo 0', () => {
    const b = platformBreakdownForOrder({ ...REF, paymentMethod: 'Efectivo' }, FALLBACK_COMMISSION);
    expect(b).toEqual({ serviceFee: 0, commission: 0, total: 0 });
  });
});

// Fase YY bis: quién absorbe cada reembolso. Invariante: tienda + repartidor + plataforma =
// total − reembolso en TODOS los casos; y sin `refundAllocation` el reparto es el de siempre.
import {
  grossSharesForOrder, refundSharesForOrder, suggestRefundAllocation, validateRefundAllocation,
  refundAllocationCaps, type RefundAllocation,
} from './money';

const sumParts = (o: MoneyOrder) =>
  storeNetForOrder(o, 10) + driverNetForOrder(o) + platformNetForOrder(o, 10);
const withAlloc = (amount: number, a: RefundAllocation): MoneyOrder =>
  ({ ...REF, refunded: true, refundAmount: amount, refundAllocation: a });
const PRESETS = ['proportional', 'store', 'driver', 'platform'] as const;

describe('reembolsos con asignación — invariante en todos los casos', () => {
  const amounts = [500, 2500, 6250, 12500];
  for (const amount of amounts) {
    for (const preset of PRESETS) {
      it(`${preset} · reembolso de $${amount}: partes = total − reembolso, ninguna negativa`, () => {
        const { allocation } = suggestRefundAllocation(REF, 10, amount, preset);
        expect(allocation.store + allocation.driver + allocation.platform).toBeCloseTo(amount, 2);
        const o = withAlloc(amount, allocation);
        expect(sumParts(o)).toBeCloseTo(REF.total! - amount, 2);
        expect(storeNetForOrder(o, 10)).toBeGreaterThanOrEqual(0);
        expect(driverNetForOrder(o)).toBeGreaterThanOrEqual(0);
        expect(platformNetForOrder(o, 10)).toBeGreaterThanOrEqual(-1e-9);
        expect(validateRefundAllocation(REF, 10, amount, allocation).ok).toBe(true);
      });
    }
  }
  it('personalizado: cada parte baja exactamente lo asignado', () => {
    const o = withAlloc(1500, { store: 1000, driver: 300, platform: 200 });
    expect(storeNetForOrder(o, 10)).toBeCloseTo(9000 - 1000, 6);
    expect(driverNetForOrder(o)).toBeCloseTo(2000 - 300, 6);
    expect(platformNetForOrder(o, 10)).toBeCloseTo(1500 - 200, 6);
    expect(sumParts(o)).toBeCloseTo(REF.total! - 1500, 6);
  });
  it('platformBreakdown reparte la parte de la plataforma entre tarifa y comisión en proporción', () => {
    const o = withAlloc(300, { store: 0, driver: 0, platform: 300 });
    const b = platformBreakdownForOrder(o, 10);
    // bruto: tarifa 500 + comisión 1000 → absorbe 1/3 de tarifa y 2/3 de comisión
    expect(b.serviceFee).toBeCloseTo(400, 6);
    expect(b.commission).toBeCloseTo(800, 6);
    expect(b.total).toBeCloseTo(1200, 6);
    expect(b.total).toBe(platformNetForOrder(o, 10));
  });
  it('reembolso TOTAL con cualquier preset deja a todos en 0', () => {
    for (const preset of PRESETS) {
      const { allocation } = suggestRefundAllocation(REF, 10, REF.total!, preset);
      const o = withAlloc(REF.total!, allocation);
      expect(storeNetForOrder(o, 10)).toBeCloseTo(0, 2);
      expect(driverNetForOrder(o)).toBeCloseTo(0, 2);
      expect(platformNetForOrder(o, 10)).toBeCloseTo(0, 2);
    }
  });
});

describe('reembolsos — compatibilidad con lo histórico', () => {
  it('SIN refundAllocation el reparto es idéntico al de siempre (proporcional)', () => {
    const legacy: MoneyOrder = { ...REF, refunded: true, refundAmount: 2500 };
    const keep = 1 - 2500 / 12500;
    expect(storeNetForOrder(legacy, 10)).toBe(9000 * keep);
    expect(driverNetForOrder(legacy)).toBe(2000 * keep);
    expect(platformNetForOrder(legacy, 10)).toBe(500 * keep + 1000 * keep);
  });
  it('el preset proporcional da los mismos netos que el legado (al centavo)', () => {
    for (const amount of [777, 2500, 9999]) {
      const legacy: MoneyOrder = { ...REF, refunded: true, refundAmount: amount };
      const { allocation } = suggestRefundAllocation(REF, 10, amount, 'proportional');
      const o = withAlloc(amount, allocation);
      expect(Math.abs(storeNetForOrder(o, 10) - storeNetForOrder(legacy, 10))).toBeLessThanOrEqual(0.01);
      expect(Math.abs(driverNetForOrder(o) - driverNetForOrder(legacy))).toBeLessThanOrEqual(0.01);
      expect(Math.abs(platformNetForOrder(o, 10) - platformNetForOrder(legacy, 10))).toBeLessThanOrEqual(0.01);
    }
  });
  it('una asignación en un pedido NO reembolsado se ignora', () => {
    const o: MoneyOrder = { ...REF, refunded: false, refundAllocation: { store: 5000, driver: 0, platform: 0 } };
    expect(storeNetForOrder(o, 10)).toBe(9000);
  });
  it('refundSharesForOrder proporcional = bruto − neto (identidad del estado de cuenta)', () => {
    const legacy: MoneyOrder = { ...REF, refunded: true, refundAmount: 2500 };
    const g = grossSharesForOrder(legacy, 10);
    const s = refundSharesForOrder(legacy, 10);
    expect(g.store - s.store).toBeCloseTo(storeNetForOrder(legacy, 10), 9);
    expect(g.driver - s.driver).toBeCloseTo(driverNetForOrder(legacy), 9);
    expect(s.store + s.driver + s.platform).toBeCloseTo(2500, 9);
  });
  it('refundSharesForOrder con asignación = lo asignado', () => {
    const s = refundSharesForOrder(withAlloc(1500, { store: 1000, driver: 300, platform: 200 }), 10);
    expect(s.store).toBe(1000); expect(s.driver).toBe(300); expect(s.platform).toBe(200);
  });
});

describe('suggestRefundAllocation — presets y excedente', () => {
  it('La tienda: si alcanza, absorbe todo; el resto en 0', () => {
    const r = suggestRefundAllocation(REF, 10, 3000, 'store');
    expect(r.allocation).toEqual({ store: 3000, driver: 0, platform: 0 });
    expect(r.overflow).toBe(0);
  });
  it('La tienda: si no alcanza, el excedente va a la plataforma y se informa', () => {
    const r = suggestRefundAllocation(REF, 10, 10000, 'store'); // la tienda cobra 9000
    expect(r.allocation).toEqual({ store: 9000, driver: 0, platform: 1000 });
    expect(r.overflow).toBe(1000);
  });
  it('El repartidor: tope = envío; el excedente a la plataforma y después a la tienda', () => {
    const r = suggestRefundAllocation(REF, 10, 5000, 'driver');
    expect(r.allocation).toEqual({ store: 1500, driver: 2000, platform: 1500 });
    expect(r.overflow).toBe(3000);
  });
  it('La plataforma: tope = tarifa + comisión; el resto entre tienda y repartidor en proporción', () => {
    expect(suggestRefundAllocation(REF, 10, 12500, 'platform').allocation).toEqual({ store: 9000, driver: 2000, platform: 1500 });
    expect(suggestRefundAllocation(REF, 10, 1000, 'platform').allocation).toEqual({ store: 0, driver: 0, platform: 1000 });
  });
});

describe('validateRefundAllocation — lo que la ruta rechaza', () => {
  it('suma distinta al monto', () => {
    expect(validateRefundAllocation(REF, 10, 1000, { store: 500, driver: 0, platform: 0 }).ok).toBe(false);
  });
  it('negativo', () => {
    expect(validateRefundAllocation(REF, 10, 1000, { store: 1500, driver: -500, platform: 0 }).ok).toBe(false);
  });
  it('repartidor más que el envío / tienda más que su neto / plataforma más que tarifa+comisión', () => {
    expect(validateRefundAllocation(REF, 10, 2500, { store: 0, driver: 2500, platform: 0 }).ok).toBe(false);
    expect(validateRefundAllocation(REF, 10, 9500, { store: 9500, driver: 0, platform: 0 }).ok).toBe(false);
    expect(validateRefundAllocation(REF, 10, 2000, { store: 0, driver: 0, platform: 2000 }).ok).toBe(false);
  });
  it('pedido en efectivo: no hay nada que asignar', () => {
    expect(validateRefundAllocation({ ...REF, paymentMethod: 'Efectivo' }, 10, 100, { store: 100, driver: 0, platform: 0 }).ok).toBe(false);
  });
  it('tolera centavos: normaliza para que la suma sea exacta y nadie pase su tope', () => {
    const o: MoneyOrder = { total: 12527.5, subtotal: 10010, deliveryFee: 2000, serviceFee: 517.5, commissionRate: 10 };
    const caps = refundAllocationCaps(o, 10); // tienda 9009, repartidor 2000, plataforma 1518,5
    const v = validateRefundAllocation(o, 10, 3000, { store: 0, driver: 1500, platform: 1500.4 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.allocation.store + v.allocation.driver + v.allocation.platform).toBeCloseTo(3000, 6);
      expect(v.allocation.platform).toBeLessThanOrEqual(caps.platform);
    }
  });
});
