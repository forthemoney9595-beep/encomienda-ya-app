import { describe, expect, it } from 'vitest';
import { fmtDate, fmtElapsed, startOfDayArgentina, toDate, argentinaParts } from './format-date';

describe('format-date (hora Argentina, es-AR)', () => {
  it('toDate acepta Date, número, ISO y Timestamp-like', () => {
    const d = new Date('2026-10-21T21:14:00-03:00');
    expect(toDate(d)?.getTime()).toBe(d.getTime());
    expect(toDate(d.getTime())?.getTime()).toBe(d.getTime());
    expect(toDate(d.toISOString())?.getTime()).toBe(d.getTime());
    expect(toDate({ toDate: () => d })?.getTime()).toBe(d.getTime());
    expect(toDate({ seconds: Math.floor(d.getTime() / 1000) })?.getTime()).toBe(Math.floor(d.getTime() / 1000) * 1000);
    expect(toDate(null)).toBeNull();
    expect(toDate('basura')).toBeNull();
  });

  it('fmtDate formatea en hora Argentina aunque el proceso corra en UTC', () => {
    // 00:30 UTC del 22/10 = 21:30 del 21/10 en Argentina (UTC-3 fijo).
    const d = new Date('2026-10-22T00:30:00Z');
    expect(fmtDate(d, 'short')).toBe('21/10 21:30');
    expect(fmtDate(d, 'time')).toBe('21:30');
    expect(fmtDate(d, 'date')).toBe('21/10/2026');
    expect(fmtDate(d, 'long')).toContain('21 de oct de 2026');
    expect(fmtDate(null)).toBe('—');
  });

  it('fmtElapsed escala de minutos a meses', () => {
    expect(fmtElapsed(5 * 60_000)).toBe('5 min');
    expect(fmtElapsed(2 * 3_600_000 + 10 * 60_000)).toBe('2 h 10 m');
    expect(fmtElapsed(3 * 86_400_000)).toBe('3 días');
    expect(fmtElapsed(95 * 86_400_000)).toBe('3 meses 5 d');
  });

  it('startOfDayArgentina devuelve las 03:00 UTC del día calendario argentino', () => {
    const d = new Date('2026-10-22T01:00:00Z'); // 22:00 del 21/10 en Argentina
    expect(argentinaParts(d)).toEqual({ y: 2026, m: 10, d: 21 });
    expect(startOfDayArgentina(d).toISOString()).toBe('2026-10-21T03:00:00.000Z');
    expect(startOfDayArgentina(d, -6).toISOString()).toBe('2026-10-15T03:00:00.000Z');
    expect(startOfDayArgentina(d, 1).toISOString()).toBe('2026-10-22T03:00:00.000Z');
  });
});
