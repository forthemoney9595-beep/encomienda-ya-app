import { describe, expect, it } from 'vitest';
import { isStorePaused, pausedUntilMs } from './store-hours';

const now = Date.UTC(2026, 10, 7, 15, 0, 0);
// Imita un Timestamp de Firestore sin importar el SDK.
const ts = (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });

describe('isStorePaused', () => {
  it('sin manuallyPaused nunca está pausada (aunque haya un pausedUntil viejo)', () => {
    expect(isStorePaused({}, now)).toBe(false);
    expect(isStorePaused({ manuallyPaused: false, pausedUntil: ts(now + 3_600_000) }, now)).toBe(false);
    expect(isStorePaused(null, now)).toBe(false);
  });
  it('pausa sin pausedUntil = indefinida (comportamiento de siempre)', () => {
    expect(isStorePaused({ manuallyPaused: true }, now)).toBe(true);
    expect(isStorePaused({ manuallyPaused: true, pausedUntil: null }, now)).toBe(true);
  });
  it('pausa con tiempo: vigente = pausada, vencida = abierta sola', () => {
    expect(isStorePaused({ manuallyPaused: true, pausedUntil: ts(now + 60_000) }, now)).toBe(true);
    expect(isStorePaused({ manuallyPaused: true, pausedUntil: ts(now - 1) }, now)).toBe(false);
    expect(isStorePaused({ manuallyPaused: true, pausedUntil: ts(now) }, now)).toBe(false);
  });
  it('acepta Timestamp, segundos crudos, Date, número e ISO; y now como Date', () => {
    expect(pausedUntilMs({ pausedUntil: ts(now) })).toBe(now);
    expect(pausedUntilMs({ pausedUntil: { _seconds: now / 1000 } })).toBe(now);
    expect(pausedUntilMs({ pausedUntil: new Date(now) })).toBe(now);
    expect(pausedUntilMs({ pausedUntil: now })).toBe(now);
    expect(pausedUntilMs({ pausedUntil: new Date(now).toISOString() })).toBe(now);
    expect(isStorePaused({ manuallyPaused: true, pausedUntil: now + 1000 }, new Date(now))).toBe(true);
  });
});
