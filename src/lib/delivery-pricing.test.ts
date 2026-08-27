import { describe, it, expect } from 'vitest';
import {
  computeDeliveryFee,
  isBeyondDeliveryLimit,
  deliveryDistanceMeters,
  DEFAULT_INCLUDED_KM,
  DEFAULT_MAX_DISTANCE_KM,
} from './delivery-pricing';

const BASE = 2000;

describe('delivery-pricing — computeDeliveryFee', () => {
  it('con perKm en 0 (default) es SIEMPRE la base — comportamiento histórico de envío fijo', () => {
    expect(computeDeliveryFee(10_000, { deliveryFee: BASE }, BASE)).toBe(BASE);
    expect(computeDeliveryFee(null, { deliveryFee: BASE }, BASE)).toBe(BASE);
    expect(computeDeliveryFee(50_000, { deliveryFee: BASE, deliveryFeePerKm: 0 }, BASE)).toBe(BASE);
  });
  it('sin coords (distance null) cobra la base aunque perKm esté activo — nunca castiga la falta de dato', () => {
    expect(computeDeliveryFee(null, { deliveryFee: BASE, deliveryFeePerKm: 500 }, BASE)).toBe(BASE);
  });
  it('dentro de los km incluidos = base', () => {
    // 5 km incluidos por default; 4 km entra sin extra
    expect(computeDeliveryFee(4000, { deliveryFee: BASE, deliveryFeePerKm: 500 }, BASE)).toBe(BASE);
  });
  it('cobra por cada km EMPEZADO después de los incluidos', () => {
    // 10,3 km, 5 incluidos, $500/km → ceil(10,3 − 5) = 6 km extra → 2000 + 6×500 = 5000
    expect(computeDeliveryFee(10_300, { deliveryFee: BASE, deliveryFeePerKm: 500, deliveryIncludedKm: 5 }, BASE)).toBe(5000);
  });
  it('usa el fallbackBase si el config no trae deliveryFee', () => {
    expect(computeDeliveryFee(1000, {}, BASE)).toBe(BASE);
  });
  it('DEFAULT_INCLUDED_KM aplica cuando no se especifica', () => {
    // justo en el borde de los km incluidos por default no cobra extra
    expect(computeDeliveryFee(DEFAULT_INCLUDED_KM * 1000, { deliveryFee: BASE, deliveryFeePerKm: 300 }, BASE)).toBe(BASE);
  });
});

describe('delivery-pricing — isBeyondDeliveryLimit (cerco anti-disparate)', () => {
  it('dentro del cerco = false', () => {
    expect(isBeyondDeliveryLimit(10_000, {})).toBe(false); // 10 km < 50 default
  });
  it('más allá del cerco = true', () => {
    expect(isBeyondDeliveryLimit(600_000, {})).toBe(true); // 600 km (otra provincia)
  });
  it('sin distancia (null) nunca bloquea', () => {
    expect(isBeyondDeliveryLimit(null, {})).toBe(false);
  });
  it('respeta un maxDeliveryDistanceKm custom', () => {
    expect(isBeyondDeliveryLimit(12_000, { maxDeliveryDistanceKm: 10 })).toBe(true);
    expect(isBeyondDeliveryLimit(8_000, { maxDeliveryDistanceKm: 10 })).toBe(false);
  });
  it('DEFAULT_MAX_DISTANCE_KM es el default', () => {
    expect(isBeyondDeliveryLimit((DEFAULT_MAX_DISTANCE_KM + 1) * 1000, {})).toBe(true);
  });
});

describe('delivery-pricing — deliveryDistanceMeters', () => {
  it('null si falta alguna coordenada', () => {
    expect(deliveryDistanceMeters(null, { latitude: 0, longitude: 0 })).toBeNull();
    expect(deliveryDistanceMeters({ latitude: 0, longitude: 0 }, undefined)).toBeNull();
  });
  it('calcula la distancia cuando las dos son válidas', () => {
    const d = deliveryDistanceMeters({ latitude: -28.0, longitude: -67.5 }, { latitude: -28.05, longitude: -67.55 });
    expect(d).toBeGreaterThan(0);
  });
});
