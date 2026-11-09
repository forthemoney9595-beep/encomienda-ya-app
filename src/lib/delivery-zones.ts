// Zonas de entrega (9/11/2026) — módulo puro, compartido por el servidor y la UI.
//
// La zona es una ETIQUETA aproximada ("Santa Rosa") que el repartidor ve ANTES de aceptar
// un pedido, en lugar de la dirección exacta (que sigue apareciendo recién al tomarlo, igual
// que en Rappi/PedidosYa). Se calcula en /api/orders/create con el punto del cliente y se
// guarda en el pedido como texto: nunca se guardan ni se muestran las coordenadas.
//
// Origen de los puntos: OpenStreetMap (place=town/village/hamlet/… del Departamento
// Tinogasta). Distancias por ruta desde la plaza, medidas con Google Routes el 9/11:
// Santa Rosa 3,9 km · San Roque 4,5 · Cachiyuyo 7,2 · San Miguel 9,8 · La Puntilla 10,5 ·
// San José 10,7 · La Florida 14,4 · Copacabana 16,4 · El Puesto 16,6 · Higuerita 18,1 ·
// Banda de Lucero 19,8 · Anillaco 22,9 · Río La Troya 26,5 · Río Colorado 27,8 ·
// Andaluca 29,8 · Costa de los Reyes 30,5 · Fiambalá 49 · Salado 50,9.
// Para sumar un paraje: agregarlo acá con su punto de OpenStreetMap.

import { distanceMeters, isValidCoords } from './geo';

export interface DeliveryZone {
  name: string;
  latitude: number;
  longitude: number;
}

/** El pueblo: cualquier punto a menos de este radio de la plaza es "Tinogasta". */
export const TOWN: DeliveryZone = { name: 'Tinogasta', latitude: -28.0655, longitude: -67.5644 };
export const TOWN_RADIUS_M = 2500;

/** Más lejos que esto del paraje más cercano → "Cerca de X" (casas sueltas entre parajes). */
export const NEAR_RADIUS_M = 4000;

export const ZONES: DeliveryZone[] = [
  { name: 'Santa Rosa', latitude: -28.0407, longitude: -67.5856 },
  { name: 'San Roque', latitude: -28.0306, longitude: -67.5835 },
  { name: 'San Miguel', latitude: -28.0136, longitude: -67.5807 },
  { name: 'Cachiyuyo', latitude: -28.0085, longitude: -67.5473 },
  { name: 'La Florida', latitude: -27.9836, longitude: -67.5575 },
  { name: 'San José', latitude: -27.9869, longitude: -67.5939 },
  { name: 'La Puntilla', latitude: -28.1314, longitude: -67.4981 },
  { name: 'Higuerita', latitude: -28.1178, longitude: -67.6925 },
  { name: 'Cienaguita', latitude: -28.1754, longitude: -67.6918 },
  { name: 'El Puesto', latitude: -27.9550, longitude: -67.6337 },
  { name: 'Copacabana', latitude: -28.1765, longitude: -67.4881 },
  { name: 'Banda de Lucero', latitude: -28.1730, longitude: -67.4646 },
  { name: 'Anillaco', latitude: -27.9088, longitude: -67.6220 },
  { name: 'Río La Troya', latitude: -27.8770, longitude: -67.6799 },
  { name: 'Río Colorado', latitude: -28.2351, longitude: -67.7008 },
  { name: 'Andaluca', latitude: -28.2663, longitude: -67.4271 },
  { name: 'Costa de los Reyes', latitude: -28.2931, longitude: -67.6928 },
  { name: 'Fiambalá', latitude: -27.6922, longitude: -67.6189 },
  { name: 'Salado', latitude: -28.3048, longitude: -67.2478 },
];

/**
 * Nombre de la zona de un punto: "Tinogasta" dentro del pueblo, el paraje más cercano si
 * está a menos de NEAR_RADIUS_M, "Cerca de X" si queda entre parajes. null sin coords.
 */
export function zoneForPoint(coords: unknown): string | null {
  if (!isValidCoords(coords)) return null;
  if (distanceMeters(TOWN, coords) <= TOWN_RADIUS_M) return TOWN.name;

  let best: DeliveryZone = TOWN;
  let bestD = distanceMeters(TOWN, coords);
  for (const z of ZONES) {
    const d = distanceMeters(z, coords);
    if (d < bestD) { best = z; bestD = d; }
  }
  return bestD <= NEAR_RADIUS_M ? best.name : `Cerca de ${best.name}`;
}

/** "≈ 15 min" a partir de segundos (redondeado hacia arriba, mínimo 1). */
export function formatTravelMinutes(seconds: number): string {
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}
