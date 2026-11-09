import { describe, it, expect, vi, afterEach } from 'vitest';
import { zoneForPoint, formatTravelMinutes, ZONES, TOWN } from './delivery-zones';
import { getRouteDistance } from './route-distance-server';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

describe('delivery-zones — zoneForPoint', () => {
  it('sin coordenadas no inventa una zona', () => {
    expect(zoneForPoint(null)).toBeNull();
    expect(zoneForPoint({ latitude: 'x', longitude: 1 })).toBeNull();
  });
  it('la plaza y el casco urbano son "Tinogasta"', () => {
    expect(zoneForPoint(TOWN)).toBe('Tinogasta');
    expect(zoneForPoint({ latitude: -28.0590, longitude: -67.5600 })).toBe('Tinogasta'); // 5 cuadras
  });
  it('el punto de cada paraje cae en su propia zona', () => {
    for (const z of ZONES) expect(zoneForPoint(z)).toBe(z.name);
  });
  it('una casa a 1 km de Santa Rosa es "Santa Rosa"', () => {
    expect(zoneForPoint({ latitude: -28.0407, longitude: -67.5960 })).toBe('Santa Rosa');
  });
  it('lejos de todo paraje dice "Cerca de X"', () => {
    expect(zoneForPoint({ latitude: -28.6, longitude: -67.5 })).toMatch(/^Cerca de /);
  });
});

describe('delivery-zones — formatTravelMinutes', () => {
  it('redondea hacia arriba y nunca muestra 0', () => {
    expect(formatTravelMinutes(845)).toBe('15 min');
    expect(formatTravelMinutes(5)).toBe('1 min');
  });
});

describe('route-distance-server — getRouteDistance', () => {
  const A = { latitude: -28.0655, longitude: -67.5644 };
  const B = { latitude: -28.0407, longitude: -67.5856 };
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('sin clave no llama a Google y devuelve null (queda la línea recta)', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(await getRouteDistance(A, B)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('lee distancia y duración de la respuesta', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ distanceMeters: 3912, duration: '421s' }] }) }));
    expect(await getRouteDistance(A, B)).toEqual({ distanceM: 3912, durationS: 421 });
  });
  it('error de Google, tope diario (429) o red caída → null, nunca lanza', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    expect(await getRouteDistance(A, B)).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('red caída')));
    expect(await getRouteDistance(A, B)).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }));
    expect(await getRouteDistance(A, B)).toBeNull();
  });
  it('coordenadas inválidas → null sin llamar', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'k');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(await getRouteDistance(null, B)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
