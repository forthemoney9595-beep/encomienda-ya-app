import { describe, it, expect } from 'vitest';
import { isChristmasActive, normalizeChristmasMode } from './seasonal';

// Instante de una hora de pared ARGENTINA (UTC-3 fijo): 00:00 ART = 03:00 UTC.
const art = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) => Date.UTC(y, m - 1, d, hh + 3, mm, ss);

describe('isChristmasActive (auto)', () => {
  it('se prende el 8/12 a las 00:00 en Argentina, no antes', () => {
    expect(isChristmasActive(art(2026, 12, 7, 23, 59, 59))).toBe(false);
    expect(isChristmasActive(art(2026, 12, 8, 0, 0, 0))).toBe(true);
  });

  it('el 8/12 a las 00:30 ART ya es 8/12 aunque en UTC sea 03:30 del 8; el 7/12 22:00 ART (01:00 UTC del 8) todavía no', () => {
    expect(isChristmasActive(art(2026, 12, 8, 0, 30))).toBe(true);
    expect(isChristmasActive(Date.UTC(2026, 11, 8, 1, 0))).toBe(false); // 7/12 22:00 ART
  });

  it('sigue prendida en Nochebuena, Año Nuevo (cruce de año) y Reyes', () => {
    expect(isChristmasActive(art(2026, 12, 24, 21))).toBe(true);
    expect(isChristmasActive(art(2026, 12, 31, 23, 59, 59))).toBe(true);
    expect(isChristmasActive(art(2027, 1, 1, 0, 0, 0))).toBe(true);
    expect(isChristmasActive(art(2027, 1, 6, 23, 59, 59))).toBe(true);
  });

  it('se apaga el 7/1 a las 00:00 ART', () => {
    expect(isChristmasActive(art(2027, 1, 7, 0, 0, 0))).toBe(false);
    // 6/1 23:30 ART = 7/1 02:30 UTC: en UTC ya sería 7, pero en Argentina sigue siendo Reyes.
    expect(isChristmasActive(Date.UTC(2027, 0, 7, 2, 30))).toBe(true);
  });

  it('el resto del año queda apagada', () => {
    expect(isChristmasActive(art(2026, 11, 9, 12))).toBe(false);
    expect(isChristmasActive(art(2026, 7, 15))).toBe(false);
    expect(isChristmasActive(art(2027, 2, 1))).toBe(false);
  });
});

describe('isChristmasActive (forzada)', () => {
  it("'on' prende siempre y 'off' apaga siempre", () => {
    expect(isChristmasActive(art(2026, 7, 15), 'on')).toBe(true);
    expect(isChristmasActive(art(2026, 12, 24), 'off')).toBe(false);
  });
});

describe('normalizeChristmasMode', () => {
  it('lo desconocido o ausente es auto', () => {
    expect(normalizeChristmasMode(undefined)).toBe('auto');
    expect(normalizeChristmasMode('siempre')).toBe('auto');
    expect(normalizeChristmasMode(1)).toBe('auto');
    expect(normalizeChristmasMode('on')).toBe('on');
    expect(normalizeChristmasMode('off')).toBe('off');
  });
});
