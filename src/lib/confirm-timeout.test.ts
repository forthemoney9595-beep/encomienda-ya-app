import { describe, expect, it } from 'vitest';
import {
  AUTO_UNCONFIRMED, CONFIRM_DEFAULTS, confirmConfigError, decideConfirmTimeout, describeOrderEnding, resolveConfirmConfig,
} from './confirm-timeout';
import { acceptanceRate, computeStoreAlerts, fmtConfirmSeconds, STORE_ALERT_THRESHOLD } from './store-compliance';

const MIN = 60_000;
const created = Date.UTC(2026, 10, 7, 15, 0, 0);
const cfg = { reminderMinutes: 5, timeoutMinutes: 15 };
const base = { status: 'Pendiente de Confirmación', createdAtMs: created, reminderSentAtMs: null, config: cfg };

describe('decideConfirmTimeout', () => {
  it('antes del recordatorio no hace nada y devuelve los dos momentos', () => {
    const d = decideConfirmTimeout({ ...base, nowMs: created + 4 * MIN });
    expect(d).toEqual({ action: 'none', reminderAt: created + 5 * MIN, timeoutAt: created + 15 * MIN });
  });
  it('pasado el recordatorio y sin mandarlo → remind; ya mandado → none', () => {
    expect(decideConfirmTimeout({ ...base, nowMs: created + 5 * MIN }).action).toBe('remind');
    expect(decideConfirmTimeout({ ...base, nowMs: created + 6 * MIN, reminderSentAtMs: created + 5 * MIN }).action).toBe('none');
  });
  it('pasado el timeout → cancel, haya salido o no el recordatorio', () => {
    expect(decideConfirmTimeout({ ...base, nowMs: created + 15 * MIN }).action).toBe('cancel');
    expect(decideConfirmTimeout({ ...base, nowMs: created + 90 * MIN, reminderSentAtMs: created + 5 * MIN }).action).toBe('cancel');
  });
  it('un pedido que ya no está pendiente NUNCA se cancela (confirmado / rechazado / cancelado)', () => {
    for (const status of ['Pendiente de Pago', 'En preparación', 'Rechazado', 'Cancelado', 'Entregado']) {
      expect(decideConfirmTimeout({ ...base, status, nowMs: created + 60 * MIN }).action).toBe('none');
    }
  });
  it('sin createdAt no decide nada', () => {
    expect(decideConfirmTimeout({ ...base, createdAtMs: null, nowMs: created + 60 * MIN })).toEqual({ action: 'none', reminderAt: null, timeoutAt: null });
  });
});

describe('resolveConfirmConfig / confirmConfigError', () => {
  it('defaults 5/15 si no hay config o viene basura', () => {
    expect(resolveConfirmConfig(undefined)).toEqual({ ...CONFIRM_DEFAULTS });
    expect(resolveConfirmConfig({ confirmReminderMinutes: 'x', confirmTimeoutMinutes: -3 })).toEqual({ ...CONFIRM_DEFAULTS });
  });
  it('respeta valores válidos y cae a defaults si el timeout no supera al recordatorio', () => {
    expect(resolveConfirmConfig({ confirmReminderMinutes: 10, confirmTimeoutMinutes: 30 })).toEqual({ reminderMinutes: 10, timeoutMinutes: 30 });
    expect(resolveConfirmConfig({ confirmReminderMinutes: 20, confirmTimeoutMinutes: 20 })).toEqual({ ...CONFIRM_DEFAULTS });
    expect(resolveConfirmConfig({ confirmReminderMinutes: 1, confirmTimeoutMinutes: 15 })).toEqual({ reminderMinutes: 5, timeoutMinutes: 15 });
  });
  it('valida rangos 2–30 / 5–60 y el orden', () => {
    expect(confirmConfigError({ confirmReminderMinutes: 5, confirmTimeoutMinutes: 15 })).toBeNull();
    expect(confirmConfigError({})).toBeNull();
    expect(confirmConfigError({ confirmReminderMinutes: 1, confirmTimeoutMinutes: 15 })).toMatch(/entre 2 y 30/);
    expect(confirmConfigError({ confirmReminderMinutes: 5, confirmTimeoutMinutes: 61 })).toMatch(/entre 5 y 60/);
    expect(confirmConfigError({ confirmReminderMinutes: 10, confirmTimeoutMinutes: 10 })).toMatch(/DESPUÉS/);
    expect(confirmConfigError({ confirmReminderMinutes: NaN, confirmTimeoutMinutes: 15 })).toMatch(/vacío/);
  });
});

describe('describeOrderEnding', () => {
  it('rotula la cancelación automática como "No confirmado a tiempo"', () => {
    expect(describeOrderEnding({ status: 'Cancelado', cancelReason: AUTO_UNCONFIRMED, cancelledBy: 'system' })?.label).toBe('No confirmado a tiempo');
  });
  it('distingue quién canceló y muestra el motivo del rechazo', () => {
    expect(describeOrderEnding({ status: 'Cancelado', cancelledBy: 'buyer' })?.label).toBe('Cancelado por el cliente');
    expect(describeOrderEnding({ status: 'Cancelado', cancelledBy: 'admin', cancelReason: 'duplicado' })).toEqual({ label: 'Cancelado por la administración', detail: 'duplicado' });
    expect(describeOrderEnding({ status: 'Rechazado', rejectionReason: 'sin gas' })).toEqual({ label: 'Rechazado por la tienda', detail: 'sin gas' });
    expect(describeOrderEnding({ status: 'Entregado' })).toBeNull();
  });
});

describe('store-compliance', () => {
  const now = created + 60 * MIN;
  const row = (id: string, storeId: string, d: string, minAgo: number) => ({ id, storeId, storeName: storeId.toUpperCase(), storeDecision: d, storeDecisionAt: new Date(now - minAgo * MIN) });
  it(`alerta con ${STORE_ALERT_THRESHOLD} rechazos/no confirmados en 30 min, no con 2 ni fuera de la ventana`, () => {
    const alerts = computeStoreAlerts([
      row('1', 'a', 'rejected', 1), row('2', 'a', 'timeout', 10), row('3', 'a', 'rejected', 29),
      row('4', 'b', 'rejected', 1), row('5', 'b', 'rejected', 2), row('6', 'b', 'rejected', 31),
      row('7', 'c', 'confirmed', 1), row('8', 'c', 'confirmed', 2), row('9', 'c', 'rejected', 3),
    ], now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ storeId: 'a', rejected: 2, timeouts: 1, total: 3 });
  });
  it('tasa de aceptación y formato del tiempo', () => {
    expect(acceptanceRate(8, 1, 1)).toBe(80);
    expect(acceptanceRate(0, 0, 0)).toBeNull();
    expect(acceptanceRate(null, 0, 0)).toBeNull();
    expect(fmtConfirmSeconds(45)).toBe('45 s');
    expect(fmtConfirmSeconds(150)).toBe('2 min 30 s');
    expect(fmtConfirmSeconds(null)).toBe('—');
  });
});
