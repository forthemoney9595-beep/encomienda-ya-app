import { describe, it, expect } from 'vitest';
import {
  aggregateDailyOrders, sumDailyBuckets, roundDailyBucket, dayIdART, dayStartART, addDaysId, listDayIds,
  type DailyOrderInput,
} from './platform-daily';
import { platformNetForOrder, storeNetForOrder, driverNetForOrder } from './money';

// Pedido de referencia de money.ts: $10.000 productos + $2.000 envío + $500 tarifa (5 %), 10 %.
const REF: DailyOrderInput = {
  status: 'Entregado', total: 12500, subtotal: 10000, deliveryFee: 2000, serviceFee: 500,
  paymentMethod: 'mercadopago', commissionRate: 10, createdAtMs: 0, deliveredAtMs: 45 * 60_000,
};

describe('platform-daily — agregación de un día', () => {
  it('un entregado: tarifas + comisiones = neto; toStores/toDrivers idénticos a money.ts', () => {
    const b = aggregateDailyOrders([REF], 10);
    expect(b.ordersCreated).toBe(1);
    expect(b.delivered).toBe(1);
    expect(b.serviceFees).toBeCloseTo(500, 6);
    expect(b.commissions).toBeCloseTo(1000, 6);
    expect(b.platform).toBeCloseTo(platformNetForOrder(REF, 10), 6);
    expect(b.toStores).toBeCloseTo(storeNetForOrder(REF, 10), 6);
    expect(b.toDrivers).toBeCloseTo(driverNetForOrder(REF), 6);
    expect(b.revenue).toBe(12500);
    expect(b.avgTicket).toBe(12500);
    expect(b.avgDeliveryMin).toBe(45);
    expect(b.deliveryTimedCount).toBe(1);
    // invariante de reparto: tienda + repartidor + app = lo que pagó el cliente
    expect(b.toStores + b.toDrivers + b.platform).toBeCloseTo(12500, 6);
  });

  it('cancelados y rechazados cuentan como creados pero no mueven plata', () => {
    const b = aggregateDailyOrders([
      { ...REF, status: 'Cancelado' },
      { ...REF, status: 'Rechazado' },
      { ...REF, status: 'En preparación' },
    ], 10);
    expect(b.ordersCreated).toBe(3);
    expect(b.cancelled).toBe(1);
    expect(b.rejected).toBe(1);
    expect(b.delivered).toBe(0);
    expect(b.platform).toBe(0);
    expect(b.revenue).toBe(0);
    expect(b.avgTicket).toBe(0);
    expect(b.avgDeliveryMin).toBeNull();
  });

  it('reembolso parcial: el neto baja proporcionalmente (money.ts) y `refunds` suma lo devuelto', () => {
    const half = { ...REF, refunded: true, refundAmount: 6250 };
    const b = aggregateDailyOrders([half], 10);
    expect(b.refunds).toBe(6250);
    expect(b.refundedOrders).toBe(1);
    expect(b.platform).toBeCloseTo(platformNetForOrder(half, 10), 6);
    expect(b.platform).toBeCloseTo(750, 6); // (500 + 1000) × 0,5
    expect(b.revenue).toBe(12500); // bruto, sin descontar
  });

  it('reembolso CON asignación (Fase YY bis): el día descuenta a quien absorbió, no proporcional', () => {
    // $2.500 devueltos que absorbe la tienda: la app y el repartidor quedan enteros.
    const byStore = { ...REF, refunded: true, refundAmount: 2500, refundAllocation: { store: 2500, driver: 0, platform: 0 } };
    const b = aggregateDailyOrders([byStore], 10);
    expect(b.refunds).toBe(2500);
    expect(b.toStores).toBeCloseTo(9000 - 2500, 6);
    expect(b.toDrivers).toBeCloseTo(2000, 6);
    expect(b.platform).toBeCloseTo(1500, 6);
    expect(b.serviceFees).toBeCloseTo(500, 6);
    expect(b.commissions).toBeCloseTo(1000, 6);
    expect(b.toStores + b.toDrivers + b.platform).toBeCloseTo(12500 - 2500, 6);
    // Lo absorbe la plataforma: baja tarifa y comisión en proporción (1/3 y 2/3).
    const byPlat = { ...REF, refunded: true, refundAmount: 300, refundAllocation: { store: 0, driver: 0, platform: 300 } };
    const p = aggregateDailyOrders([byPlat], 10);
    expect(p.platform).toBeCloseTo(1200, 6);
    expect(p.serviceFees).toBeCloseTo(400, 6);
    expect(p.commissions).toBeCloseTo(800, 6);
    expect(p.toStores).toBeCloseTo(9000, 6);
    // El MISMO monto sin asignación sigue siendo proporcional (lo histórico no cambia).
    const legacy = aggregateDailyOrders([{ ...REF, refunded: true, refundAmount: 2500 }], 10);
    expect(legacy.toStores).toBeCloseTo(9000 * 0.8, 6);
    expect(legacy.toDrivers).toBeCloseTo(2000 * 0.8, 6);
  });

  it('un reembolso sobre un pedido cancelado tras pagar cuenta en `refunds` aunque no se haya entregado', () => {
    const b = aggregateDailyOrders([{ ...REF, status: 'Cancelado', refunded: true, refundAmount: 12500 }], 10);
    expect(b.refunds).toBe(12500);
    expect(b.cancelled).toBe(1);
    expect(b.platform).toBe(0);
  });

  it('efectivo: no suma plata (la plataforma nunca la cobró) pero sí cuenta la entrega', () => {
    const b = aggregateDailyOrders([{ ...REF, paymentMethod: 'Efectivo' }], 10);
    expect(b.delivered).toBe(1);
    expect(b.platform).toBe(0);
    expect(b.toStores).toBe(0);
    expect(b.revenue).toBe(12500);
  });

  it('sin deliveredAt no aporta al tiempo promedio; con varias entregas promedia bien', () => {
    const b = aggregateDailyOrders([
      { ...REF, deliveredAtMs: null },
      { ...REF, createdAtMs: 0, deliveredAtMs: 30 * 60_000 },
      { ...REF, createdAtMs: 0, deliveredAtMs: 90 * 60_000 },
    ], 10);
    expect(b.deliveryTimedCount).toBe(2);
    expect(b.avgDeliveryMin).toBe(60);
  });

  it('usa la comisión por defecto solo si el pedido no la tiene congelada', () => {
    const noRate = { ...REF, commissionRate: undefined };
    expect(aggregateDailyOrders([noRate], 20).commissions).toBeCloseTo(2000, 6);
    expect(aggregateDailyOrders([REF], 20).commissions).toBeCloseTo(1000, 6);
  });
});

describe('platform-daily — suma de buckets (períodos)', () => {
  it('suma totales y recompone los promedios ponderados', () => {
    const a = aggregateDailyOrders([REF, { ...REF, createdAtMs: 0, deliveredAtMs: 15 * 60_000 }], 10); // 2 entregas, 30 min prom
    const b = aggregateDailyOrders([{ ...REF, total: 20000, subtotal: 17500, createdAtMs: 0, deliveredAtMs: 120 * 60_000 }], 10);
    const s = sumDailyBuckets([a, null, undefined, b]);
    expect(s.delivered).toBe(3);
    expect(s.revenue).toBe(12500 + 12500 + 20000);
    expect(s.avgTicket).toBeCloseTo(45000 / 3, 6);
    expect(s.deliveryTimedCount).toBe(3);
    expect(s.avgDeliveryMin).toBeCloseTo((45 + 15 + 120) / 3, 6);
    expect(s.platform).toBeCloseTo(a.platform + b.platform, 6);
  });

  it('tolera docs parciales (campos faltantes = 0)', () => {
    const s = sumDailyBuckets([{ delivered: 2, revenue: 1000 }, { platform: 50 }]);
    expect(s.delivered).toBe(2);
    expect(s.platform).toBe(50);
    expect(s.avgTicket).toBe(500);
    expect(s.avgDeliveryMin).toBeNull();
  });

  it('roundDailyBucket redondea a peso y deja el promedio de tiempo con 1 decimal', () => {
    const r = roundDailyBucket({ ...aggregateDailyOrders([{ ...REF, total: 12500.6, deliveredAtMs: 1234567 }], 10) });
    expect(Number.isInteger(r.revenue)).toBe(true);
    expect(Number.isInteger(r.platform)).toBe(true);
    expect(r.avgDeliveryMin).toBeCloseTo(20.6, 1);
  });
});

describe('platform-daily — días en hora Argentina', () => {
  it('un instante a las 01:00 UTC pertenece al día ANTERIOR en Argentina (UTC-3)', () => {
    expect(dayIdART(Date.UTC(2026, 9, 21, 1, 0, 0))).toBe('2026-10-20');
    expect(dayIdART(Date.UTC(2026, 9, 21, 3, 0, 0))).toBe('2026-10-21'); // 00:00 ART exacto
    expect(dayIdART(Date.UTC(2026, 9, 21, 2, 59, 59))).toBe('2026-10-20');
  });

  it('dayStartART es el inverso de dayIdART en el borde', () => {
    const start = dayStartART('2026-10-21');
    expect(start.toISOString()).toBe('2026-10-21T03:00:00.000Z');
    expect(dayIdART(start)).toBe('2026-10-21');
    expect(dayIdART(start.getTime() - 1)).toBe('2026-10-20');
  });

  it('addDaysId cruza meses y años; listDayIds es inclusiva', () => {
    expect(addDaysId('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysId('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysId('2026-03-01', -1)).toBe('2026-02-28');
    expect(listDayIds('2026-10-29', '2026-11-02')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(listDayIds('2026-11-02', '2026-10-29')).toEqual([]);
  });
});

describe('platform-daily — períodos del Resumen financiero', () => {
  // Importado acá para no tocar el bloque de arriba.
  it('7d y 30d: días calendario, hoy incluido, comparación con el bloque anterior del mismo largo', async () => {
    const { financePeriodBounds } = await import('./platform-daily');
    const b7 = financePeriodBounds('7d', '2026-10-21');
    expect(b7).toMatchObject({ fromId: '2026-10-15', toId: '2026-10-21', prevFromId: '2026-10-08', prevToId: '2026-10-14', includesToday: true });
    const b30 = financePeriodBounds('30d', '2026-10-21');
    expect(b30).toMatchObject({ fromId: '2026-09-22', toId: '2026-10-21', prevFromId: '2026-08-23', prevToId: '2026-09-21' });
  });
  it("'month' compara contra el MISMO TRAMO del mes pasado (y recorta al largo del mes)", async () => {
    const { financePeriodBounds } = await import('./platform-daily');
    expect(financePeriodBounds('month', '2026-10-21')).toMatchObject({ fromId: '2026-10-01', toId: '2026-10-21', prevFromId: '2026-09-01', prevToId: '2026-09-21', includesToday: true });
    expect(financePeriodBounds('month', '2026-03-31')).toMatchObject({ prevFromId: '2026-02-01', prevToId: '2026-02-28' });
    expect(financePeriodBounds('month', '2026-01-05')).toMatchObject({ prevFromId: '2025-12-01', prevToId: '2025-12-05' });
  });
  it("'prevMonth' = mes pasado completo vs el anterior completo, sin hoy", async () => {
    const { financePeriodBounds } = await import('./platform-daily');
    expect(financePeriodBounds('prevMonth', '2026-10-21')).toMatchObject({ fromId: '2026-09-01', toId: '2026-09-30', prevFromId: '2026-08-01', prevToId: '2026-08-31', includesToday: false });
    expect(financePeriodBounds('prevMonth', '2026-01-10')).toMatchObject({ fromId: '2025-12-01', toId: '2025-12-31', prevFromId: '2025-11-01', prevToId: '2025-11-30' });
  });
  it("'year' = 365 días sin comparación", async () => {
    const { financePeriodBounds } = await import('./platform-daily');
    expect(financePeriodBounds('year', '2026-10-21')).toMatchObject({ fromId: '2025-10-22', toId: '2026-10-21', prevFromId: null, prevToId: null });
  });
});
