import { describe, expect, it } from 'vitest';
import { computeStuckOrders, lastMovementMs, STUCK_THRESHOLDS_H } from './order-stuck';

const H = 3_600_000;
const now = Date.UTC(2026, 9, 21, 15, 0, 0);
const at = (hoursAgo: number) => new Date(now - hoursAgo * H);

describe('order-stuck', () => {
  it('toma el último movimiento conocido, no la creación', () => {
    expect(lastMovementMs({ id: 'a', status: 'En camino', createdAt: at(5), takenAt: at(1) })).toBe(now - 1 * H);
    expect(lastMovementMs({ id: 'b', status: 'En camino' })).toBeNull();
  });

  it('marca trabado solo al superar el umbral del estado, del más viejo al más nuevo', () => {
    const orders = [
      { id: 'ok', status: 'Pendiente de Confirmación', createdAt: at(0.5) },     // umbral 1h → no
      { id: 'conf', status: 'Pendiente de Confirmación', createdAt: at(2) },     // sí
      { id: 'listo', status: 'Listo para recoger', createdAt: at(10), updatedAt: at(3) }, // 3h desde el último movimiento → sí (umbral 2h)
      { id: 'reparto', status: 'En reparto', createdAt: at(6), pickedUpAt: at(1) },      // 1h → no (umbral 4h)
      { id: 'done', status: 'Entregado', createdAt: at(50) },                     // sin umbral → nunca
    ];
    const stuck = computeStuckOrders(orders, now);
    expect(stuck.map(s => s.order.id)).toEqual(['listo', 'conf']);
    expect(stuck[0].hours).toBeCloseTo(3);
  });

  it('los umbrales cubren los 6 estados activos', () => {
    expect(Object.keys(STUCK_THRESHOLDS_H)).toHaveLength(6);
  });
});
