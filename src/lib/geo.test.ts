import { describe, it, expect } from 'vitest';
import { isValidCoords, distanceMeters, formatDistance, geoErrorMessage } from './geo';

describe('geo.ts — isValidCoords', () => {
  it('acepta coords válidas', () => {
    expect(isValidCoords({ latitude: -28.06, longitude: -67.57 })).toBe(true);
    expect(isValidCoords({ latitude: 0, longitude: 0 })).toBe(true);
  });
  it('rechaza fuera de rango', () => {
    expect(isValidCoords({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoords({ latitude: 0, longitude: 181 })).toBe(false);
  });
  it('rechaza formas inválidas (strings, null, NaN, faltantes)', () => {
    expect(isValidCoords({ latitude: '10', longitude: '20' })).toBe(false);
    expect(isValidCoords({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(isValidCoords(null)).toBe(false);
    expect(isValidCoords(undefined)).toBe(false);
    expect(isValidCoords({ latitude: 10 })).toBe(false);
  });
});

describe('geo.ts — distanceMeters (haversine)', () => {
  it('mismo punto = 0', () => {
    const p = { latitude: -28.06, longitude: -67.57 };
    expect(distanceMeters(p, p)).toBeCloseTo(0, 6);
  });
  it('~1 grado de latitud ≈ 111 km', () => {
    const d = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
  it('es simétrica', () => {
    const a = { latitude: -28.0, longitude: -67.5 };
    const b = { latitude: -28.1, longitude: -67.6 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('geo.ts — formatDistance (es-AR)', () => {
  it('metros bajo 1 km', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(0)).toBe('0 m');
  });
  it('km con coma decimal', () => {
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDistance(10_300)).toBe('10,3 km');
  });
  it('entrada inválida = string vacío', () => {
    expect(formatDistance(-5)).toBe('');
    expect(formatDistance(NaN)).toBe('');
  });
});

describe('geo.ts — geoErrorMessage', () => {
  it('mensajes distintos por tipo de error', () => {
    expect(geoErrorMessage({ code: 1 })).toContain('Permiso');
    expect(geoErrorMessage({ code: 2 })).toContain('GPS');
    expect(geoErrorMessage({ code: 3 })).toContain('tardó');
    expect(geoErrorMessage(undefined)).toBeTruthy();
  });
});
