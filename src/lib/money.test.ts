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
