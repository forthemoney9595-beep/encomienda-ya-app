import { describe, it, expect } from 'vitest';
import {
  buildStoreStatement, buildDriverStatement, storeWeeklyCsvRows, driverWeeklyCsvRows, ordersInRange,
  type StatementOrder,
} from './account-movements';
import { storeNetForOrder, driverNetForOrder } from './money';
import { nextSettlement, weekBoundsART, monthBoundsART, normalizeSettlementDow } from './settlement-calendar';
import { computeClaimRiskSignals, suggestedRefundPreset } from './claim-types';

const base: Omit<StatementOrder, 'id'> = {
  status: 'Entregado', total: 12500, subtotal: 10000, deliveryFee: 2000, serviceFee: 500, commissionRate: 10,
  paymentMethod: 'mercadopago', createdAt: Date.UTC(2026, 10, 4, 15), deliveredAt: Date.UTC(2026, 10, 4, 16),
};
const orders: StatementOrder[] = [
  { ...base, id: 'aaaaaaa1' },
  { ...base, id: 'aaaaaaa2', refunded: true, refundAmount: 2500, refundAllocation: { store: 2500, driver: 0, platform: 0 } },
  { ...base, id: 'aaaaaaa3', refunded: true, refundAmount: 2500 }, // legado: proporcional
  { ...base, id: 'aaaaaaa4', status: 'Cancelado' },
];

describe('estado de cuenta — mismas fórmulas que money.ts', () => {
  it('tienda: ganado = suma de storeNetForOrder de los entregados; el reembolso es detalle, no fila', () => {
    const st = buildStoreStatement(orders, [{ id: 'w1', amount: 5000, status: 'approved' }, { id: 'w2', amount: 100, status: 'pending' }], 10, { audience: 'self' });
    const expected = orders.filter(o => o.status === 'Entregado').reduce((s, o) => s + storeNetForOrder(o, 10), 0);
    expect(st.summary.earned).toBeCloseTo(expected, 6);
    expect(st.summary.paid).toBe(5000);
    expect(st.summary.requested).toBe(100);
    expect(st.movements.filter(m => m.id.startsWith('o-'))).toHaveLength(3);
    const r = st.movements.find(m => m.id === 'o-aaaaaaa2')!;
    expect(r.detail).toContain('absorbiste $2.500');
    expect(st.movements.find(m => m.id === 'o-aaaaaaa3')!.detail).toContain('proporcional');
  });
  it('repartidor: ganado = suma de driverNetForOrder; con la asignación a la tienda no pierde nada', () => {
    const st = buildDriverStatement(orders, []);
    expect(st.summary.earned).toBeCloseTo(orders.filter(o => o.status === 'Entregado').reduce((s, o) => s + driverNetForOrder(o), 0), 6);
    expect(st.movements.find(m => m.id === 'o-aaaaaaa2')!.amount).toBe(2000);
    expect(st.movements.find(m => m.id === 'o-aaaaaaa3')!.amount).toBeCloseTo(1600, 6);
  });
});

describe('resumen semanal CSV', () => {
  it('tienda: venta − comisión − reembolso absorbido = neto por fila, y el TOTAL = ganado del estado de cuenta', () => {
    const { rows, totalNet } = storeWeeklyCsvRows(orders, 10);
    const st = buildStoreStatement(orders, [], 10);
    expect(totalNet).toBeCloseTo(st.summary.earned, 6);
    const body = rows.slice(0, -1);
    expect(body).toHaveLength(3);
    for (const r of body) {
      expect(Number(r['Venta (productos)']) - Number(r['Comisión']) - Number(r['Reembolso absorbido'])).toBeCloseTo(Number(r['Neto']), 2);
    }
    expect(rows[rows.length - 1].Fecha).toBe('TOTAL');
    expect(rows[rows.length - 1]['Neto']).toBeCloseTo(totalNet, 2);
  });
  it('repartidor: solo envío, reembolso absorbido y neto (nada de la tienda)', () => {
    const { rows, totalNet } = driverWeeklyCsvRows(orders);
    expect(Object.keys(rows[0])).toEqual(['Fecha', 'Pedido', 'Tienda', 'Envío', 'Reembolso absorbido', 'Neto']);
    expect(totalNet).toBeCloseTo(2000 + 2000 + 1600, 6);
  });
  it('ordersInRange usa la fecha de ENTREGA', () => {
    // creado el domingo 8/11 23:00 ART, entregado el lunes 9/11 01:00 ART → cuenta en la semana del lunes
    const o: StatementOrder = { ...base, id: 'x', createdAt: Date.UTC(2026, 10, 9, 2), deliveredAt: Date.UTC(2026, 10, 9, 4) };
    const wk = weekBoundsART(Date.UTC(2026, 10, 12, 15)); // semana lun 9/11 – dom 15/11
    expect(wk.mondayId).toBe('2026-11-09');
    expect(ordersInRange([o], wk.fromMs, wk.toMs)).toHaveLength(1);
    const prev = weekBoundsART(Date.UTC(2026, 10, 12, 15), -1);
    expect(ordersInRange([o], prev.fromMs, prev.toMs)).toHaveLength(0);
  });
});

describe('calendario de liquidación (hora Argentina)', () => {
  it('semana lunes→domingo en ART, también en el borde de medianoche', () => {
    // sábado 7/11/2026 15:00 UTC = 12:00 ART
    const wk = weekBoundsART(Date.UTC(2026, 10, 7, 15));
    expect(wk.mondayId).toBe('2026-11-02');
    expect(wk.sundayId).toBe('2026-11-08');
    expect(wk.label).toBe('lun 2/11 – dom 8/11');
    expect(wk.fromMs).toBe(Date.UTC(2026, 10, 2, 3));
    expect(wk.toMs).toBe(Date.UTC(2026, 10, 9, 3));
    // lunes 9/11 02:00 UTC = domingo 8/11 23:00 ART → sigue siendo la semana del 2/11
    expect(weekBoundsART(Date.UTC(2026, 10, 9, 2)).mondayId).toBe('2026-11-02');
    expect(weekBoundsART(Date.UTC(2026, 10, 7, 15), -1).mondayId).toBe('2026-10-26');
  });
  it('mes calendario ART', () => {
    const m = monthBoundsART(Date.UTC(2026, 10, 7, 15));
    expect(m.fromMs).toBe(Date.UTC(2026, 10, 1, 3));
    expect(m.toMs).toBe(Date.UTC(2026, 11, 1, 3));
    expect(monthBoundsART(Date.UTC(2026, 0, 10), -1).fromMs).toBe(Date.UTC(2025, 11, 1, 3));
  });
  it('próxima liquidación: viernes por defecto; hoy si es el día y no pasó la hora del cron', () => {
    const sabado = new Date(2026, 10, 7, 12, 0); // sáb 7/11
    expect(nextSettlement(sabado, 5).label).toBe('viernes 13/11');
    const viernesTemprano = new Date(2026, 10, 13, 9, 0);
    expect(nextSettlement(viernesTemprano, 5)).toMatchObject({ label: 'viernes 13/11', isToday: true });
    const viernesTarde = new Date(2026, 10, 13, 15, 0);
    expect(nextSettlement(viernesTarde, 5).label).toBe('viernes 20/11');
    expect(nextSettlement(sabado, undefined).label).toBe('viernes 13/11');
    expect(normalizeSettlementDow(9)).toBe(5);
    expect(nextSettlement(sabado, 1).label).toBe('lunes 9/11');
  });
});

describe('reclamos — sugerencia de quién absorbe y señales antifraude', () => {
  it('la sugerencia sigue el tipo de reclamo; sin reclamo = proporcional', () => {
    expect(suggestedRefundPreset('missing_item')).toBe('store');
    expect(suggestedRefundPreset('bad_condition')).toBe('store');
    expect(suggestedRefundPreset('wrong_item')).toBe('store');
    expect(suggestedRefundPreset('not_received')).toBe('platform');
    expect(suggestedRefundPreset('stuck_order')).toBe('proportional');
    expect(suggestedRefundPreset('other')).toBe('proportional');
    expect(suggestedRefundPreset(null)).toBe('proportional');
  });
  it('señales: "no llegó" con PIN, cuenta nueva (< 7 días) y ≥ 2 reclamos en 30 días', () => {
    const now = Date.UTC(2026, 10, 7);
    const codes = (x: Parameters<typeof computeClaimRiskSignals>[0]) => computeClaimRiskSignals(x).map(s => s.code);
    expect(codes({ type: 'not_received', deliveryPinVerified: true, nowMs: now })).toEqual(['pin_verified_not_received']);
    expect(codes({ type: 'not_received', deliveryPinVerified: false, nowMs: now })).toEqual([]);
    expect(codes({ type: 'missing_item', deliveryPinVerified: true, nowMs: now })).toEqual([]);
    expect(codes({ type: 'other', accountCreatedMs: now - 2 * 86_400_000, nowMs: now })).toEqual(['new_account']);
    expect(codes({ type: 'other', accountCreatedMs: now - 30 * 86_400_000, nowMs: now })).toEqual([]);
    expect(codes({ type: 'other', previousClaimsInWindow: 1, nowMs: now })).toEqual([]);
    expect(codes({ type: 'other', previousClaimsInWindow: 2, nowMs: now })).toEqual(['repeat_claims']);
  });
});
