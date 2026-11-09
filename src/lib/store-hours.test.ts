import { describe, expect, it } from 'vitest';
import {
  isStorePaused, pausedUntilMs, getStoreOpenStatus, normalizeSchedule, normalizeWeeklySchedule, describeSchedule,
  upcomingSpecialDays, describeUpcomingSpecialDays, formatSpecialDay, validateSpecialDays, buildSpecialHours,
} from './store-hours';

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

// ── Horario especial por fecha (nov 2026) ─────────────────────────────────────────────
// `now` con campos de pared (como nowInArgentina()): new Date(y, m, d, h, min) local.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);
const WEEK_9_22 = Array.from({ length: 7 }, () => ({ closed: false, ranges: [{ open: '09:00', close: '22:00' }] }));
const statusOf = (store: any, when: Date) => getStoreOpenStatus(normalizeSchedule(store, when), when);

describe('horario especial por fecha', () => {
  it('día especial ABIERTO: manda sobre el semanal (24/12 de 9 a 20)', () => {
    const store = { weeklySchedule: WEEK_9_22, specialHours: { '2026-12-24': { closed: false, ranges: [{ open: '09:00', close: '20:00' }] } } };
    const s = statusOf(store, at(2026, 12, 24, 19, 59));
    expect(s.isOpen).toBe(true);
    expect(s.isSpecialToday).toBe(true);
    expect(s.closesAt).toBe('20:00');
    expect(s.todayRanges).toEqual([{ open: '09:00', close: '20:00' }]);
    // A las 21 el semanal diría abierto; el especial dice cerrado.
    expect(statusOf(store, at(2026, 12, 24, 21)).isOpen).toBe(false);
    // Al día siguiente vuelve el semanal.
    expect(statusOf(store, at(2026, 12, 26, 21)).isOpen).toBe(true);
    expect(describeSchedule(store, at(2026, 12, 24, 12))).toBe('Hoy 09:00-20:00 (horario especial)');
  });

  it('día especial CERRADO (25/12): cerrada todo el día aunque el semanal abra', () => {
    const store = { weeklySchedule: WEEK_9_22, specialHours: { '2026-12-25': { closed: true, ranges: [] } } };
    const s = statusOf(store, at(2026, 12, 25, 12));
    expect(s.isOpen).toBe(false);
    expect(s.closedToday).toBe(true);
    expect(s.isSpecialToday).toBe(true);
    expect(describeSchedule(store, at(2026, 12, 25, 12))).toBe('Hoy cerrado (horario especial)');
  });

  it('franja especial que cruza la medianoche (31/12 de 21 a 03): sigue abierta el 1/1 a las 2', () => {
    const store = { weeklySchedule: WEEK_9_22, specialHours: { '2026-12-31': { closed: false, ranges: [{ open: '21:00', close: '03:00' }] } } };
    expect(statusOf(store, at(2026, 12, 31, 20)).isOpen).toBe(false);
    expect(statusOf(store, at(2026, 12, 31, 23, 30)).isOpen).toBe(true);
    const s = statusOf(store, at(2027, 1, 1, 2, 30));
    expect(s.isOpen).toBe(true);
    expect(s.closesAt).toBe('03:00');
    expect(statusOf(store, at(2027, 1, 1, 3, 30)).isOpen).toBe(false);
    // El 1/1 a las 10 rige el semanal (9-22) de nuevo.
    expect(statusOf(store, at(2027, 1, 1, 10)).isOpen).toBe(true);
  });

  it('una fecha especial de ayer CERRADA corta la franja nocturna semanal de ayer', () => {
    const night = Array.from({ length: 7 }, () => ({ closed: false, ranges: [{ open: '20:00', close: '02:00' }] }));
    const store = { weeklySchedule: night, specialHours: { '2026-12-24': { closed: true, ranges: [] } } };
    expect(statusOf(store, at(2026, 12, 25, 1)).isOpen).toBe(false);
    expect(statusOf({ weeklySchedule: night }, at(2026, 12, 25, 1)).isOpen).toBe(true);
  });

  it('fecha especial PASADA no afecta nada', () => {
    const store = { weeklySchedule: WEEK_9_22, specialHours: { '2025-12-25': { closed: true, ranges: [] } } };
    const when = at(2026, 11, 9, 12);
    expect(statusOf(store, when)).toEqual(statusOf({ weeklySchedule: WEEK_9_22 }, when));
    expect(normalizeSchedule(store, when)).toEqual(WEEK_9_22);
    // Tienda sin horario semanal + solo fechas viejas = sigue siendo "siempre abierta" (null).
    expect(normalizeSchedule({ specialHours: { '2025-12-25': { closed: true, ranges: [] } } }, when)).toBeNull();
  });

  it('sin specialHours: comportamiento idéntico al de siempre', () => {
    const legacy = { schedule: { open: '08:00', close: '13:00' } };
    for (const store of [{}, { weeklySchedule: WEEK_9_22 }, legacy, { specialHours: null }, { specialHours: 'basura' }]) {
      expect(normalizeSchedule(store)).toEqual(normalizeWeeklySchedule(store));
      for (const when of [at(2026, 12, 24, 8), at(2026, 12, 24, 12), at(2026, 12, 24, 23)]) {
        expect(statusOf(store, when).isSpecialToday).toBe(false);
      }
    }
    expect(getStoreOpenStatus(normalizeSchedule({}), at(2026, 12, 24, 3)).isOpen).toBe(true);
    expect(getStoreOpenStatus(normalizeSchedule(legacy), at(2026, 12, 24, 14)).isOpen).toBe(false);
    expect(getStoreOpenStatus(normalizeSchedule(legacy), at(2026, 12, 24, 9)).closesAt).toBe('13:00');
    expect(describeSchedule({ weeklySchedule: WEEK_9_22 }, at(2026, 12, 24, 12))).toBe('Hoy 09:00-22:00');
    expect(describeSchedule({}, at(2026, 12, 24, 12))).toBe('Siempre abierta');
  });

  it('tienda SIN horario semanal (siempre abierta) respeta igual el 25/12 cerrado', () => {
    const store = { specialHours: { '2026-12-25': { closed: true, ranges: [] } } };
    expect(statusOf(store, at(2026, 12, 25, 12)).isOpen).toBe(false);
    expect(statusOf(store, at(2026, 12, 26, 3)).isOpen).toBe(true);
    expect(describeSchedule(store, at(2026, 12, 26, 3))).toBe('Siempre abierta');
  });

  it('la pausa manual sigue ganando: el horario especial abierto no la levanta', () => {
    const store = {
      weeklySchedule: WEEK_9_22, manuallyPaused: true,
      specialHours: { '2026-12-24': { closed: false, ranges: [{ open: '00:00', close: '23:59' }] } },
    };
    const when = at(2026, 12, 24, 12);
    expect(statusOf(store, when).isOpen).toBe(true); // el horario dice abierta...
    expect(isStorePaused(store, when)).toBe(true);    // ...pero la pausa (chequeo previo) manda
  });

  it('upcomingSpecialDays: desde hoy, dentro de la ventana, ordenadas, con texto listo', () => {
    const store = { specialHours: {
      '2026-12-31': { closed: false, ranges: [{ open: '09:00', close: '19:00' }] },
      '2026-12-24': { closed: false, ranges: [{ open: '09:00', close: '20:00' }] },
      '2026-12-25': { closed: true, ranges: [] },
      '2026-12-20': { closed: true, ranges: [] },     // pasada
      '2027-02-01': { closed: true, ranges: [] },     // fuera de la ventana
      'no-es-fecha': { closed: true, ranges: [] },
    } };
    const when = at(2026, 12, 22, 10);
    const up = upcomingSpecialDays(store, when, 14);
    expect(up.map(d => d.date)).toEqual(['2026-12-24', '2026-12-25', '2026-12-31']);
    expect(up[0]).toMatchObject({ label: '24/12', isToday: false, closed: false });
    expect(describeUpcomingSpecialDays(store, when, 14)).toBe('24/12 de 9 a 20 · 25/12 cerrado · 31/12 de 9 a 19');
    expect(upcomingSpecialDays(store, at(2026, 12, 24, 23), 1).map(d => d.isToday)).toEqual([true]);
    expect(upcomingSpecialDays({}, when)).toEqual([]);
    expect(formatSpecialDay({ label: '24/12', closed: false, ranges: [{ open: '09:30', close: '13:00' }, { open: '17:00', close: '20:00' }] }))
      .toBe('24/12 de 9:30 a 13 y de 17 a 20');
  });

  it('validateSpecialDays / buildSpecialHours: mismo criterio que el editor semanal', () => {
    const today = '2026-12-01';
    expect(validateSpecialDays([{ date: '2026-12-24', closed: false, ranges: [{ open: '09:00', close: '20:00' }] }], today)).toBeNull();
    expect(validateSpecialDays([{ date: '2026-12-25', closed: true, ranges: [] }], today)).toBeNull();
    expect(validateSpecialDays([{ date: '', closed: true, ranges: [] }], today)).toMatch(/fecha/);
    expect(validateSpecialDays([{ date: '2026-11-30', closed: true, ranges: [] }], today)).toMatch(/ya pasó/);
    expect(validateSpecialDays([{ date: '2026-12-24', closed: false, ranges: [{ open: '20:00', close: '09:00' }] }], today)).toMatch(/posterior/);
    expect(validateSpecialDays([{ date: '2026-12-24', closed: false, ranges: [] }], today)).toMatch(/franjas/);
    expect(validateSpecialDays([
      { date: '2026-12-24', closed: true, ranges: [] }, { date: '2026-12-24', closed: true, ranges: [] },
    ], today)).toMatch(/dos veces/);
    const built = buildSpecialHours([
      { date: '2026-12-31', closed: false, ranges: [{ open: '09:00', close: '19:00' }] },
      { date: '2026-11-15', closed: true, ranges: [] }, // pasada: se limpia al guardar
      { date: '2026-12-25', closed: true, ranges: [{ open: '09:00', close: '10:00' }] },
    ], today);
    expect(Object.keys(built)).toEqual(['2026-12-25', '2026-12-31']);
    expect(built['2026-12-25']).toEqual({ closed: true, ranges: [] });
  });
});
