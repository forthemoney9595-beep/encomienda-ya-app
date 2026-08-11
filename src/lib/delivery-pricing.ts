// Precio del envío según distancia (Fase RR ter) — módulo puro compartido por
// /api/orders/create (autoritativo) y checkout-dialog (estimación en vivo).
//
// Modelo: base + $porKm por cada km EMPEZADO después de los km incluidos.
//   deliveryFee        → la base de siempre (config/platform.deliveryFee)
//   deliveryIncludedKm → km cubiertos por la base (default 5 — todo el casco urbano)
//   deliveryFeePerKm   → $ por km extra (default 0 = DESACTIVADO, envío fijo como siempre)
//   maxDeliveryDistanceKm → cerco anti-disparate (default 50 km): un pin que quedó en
//     otra provincia por un error de GPS se rechaza en el create con mensaje claro.
//     A propósito GENEROSO: Santa Rosa (~10 km) y los parajes cercanos entran sobrados;
//     esto solo frena lo absurdo, no define zona de reparto.
//
// La distancia es LÍNEA RECTA (haversine) — la misma que ve el repartidor en su tarjeta.
// El camino real por calle es algo más largo: calibrar $porKm sabiendo eso.

import { distanceMeters, isValidCoords } from "./geo";

export const DEFAULT_INCLUDED_KM = 5;
export const DEFAULT_MAX_DISTANCE_KM = 50;

export interface DeliveryPricingConfig {
  deliveryFee?: number;          // base
  deliveryFeePerKm?: number;     // $ por km extra (0/ausente = fijo)
  deliveryIncludedKm?: number;   // km incluidos en la base
  maxDeliveryDistanceKm?: number;
}

/** Distancia tienda→cliente en metros, o null si falta alguna coordenada. */
export function deliveryDistanceMeters(
  storeCoords: unknown,
  customerCoords: unknown,
): number | null {
  if (!isValidCoords(storeCoords) || !isValidCoords(customerCoords)) return null;
  return distanceMeters(storeCoords, customerCoords);
}

/**
 * Envío final para una distancia dada. Sin coords (distance null) cobra la base —
 * nunca castiga la falta de dato, y con `deliveryFeePerKm` en 0 es idéntico al
 * comportamiento histórico de envío fijo.
 */
export function computeDeliveryFee(
  distanceM: number | null,
  cfg: DeliveryPricingConfig,
  fallbackBase: number,
): number {
  const base = Number(cfg.deliveryFee ?? fallbackBase);
  const perKm = Number(cfg.deliveryFeePerKm ?? 0);
  if (!perKm || perKm <= 0 || distanceM == null) return base;

  const includedKm = Number(cfg.deliveryIncludedKm ?? DEFAULT_INCLUDED_KM);
  const extraKm = Math.max(0, Math.ceil(distanceM / 1000 - includedKm));
  return base + extraKm * perKm;
}

/** true si la distancia supera el cerco anti-disparate. */
export function isBeyondDeliveryLimit(
  distanceM: number | null,
  cfg: DeliveryPricingConfig,
): boolean {
  if (distanceM == null) return false;
  const maxKm = Number(cfg.maxDeliveryDistanceKm ?? DEFAULT_MAX_DISTANCE_KM);
  if (!Number.isFinite(maxKm) || maxKm <= 0) return false;
  return distanceM / 1000 > maxKm;
}
