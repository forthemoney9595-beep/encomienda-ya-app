// Distancia y tiempo REALES por ruta (Google Routes API) — solo servidor (9/11/2026).
//
// Se llama UNA vez por pedido, en /api/orders/create (nunca desde el checkout mientras el
// cliente mueve el pin: eso multiplicaría las consultas). Plan de Google: ~10.000 consultas
// gratis por mes; además la cuota diaria del proyecto está topeada en Google Cloud
// (ComputeRoutes per day = 300), así que el gasto máximo posible es de centavos.
//
// Si falta la clave, Google tarda o responde error, devuelve null y el pedido sigue con la
// línea recta de siempre: un pedido NUNCA se traba por esto.

import * as Sentry from '@sentry/nextjs';
import { isValidCoords } from './geo';

export interface RouteResult {
  distanceM: number;
  durationS: number;
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 4000;

export async function getRouteDistance(origin: unknown, destination: unknown): Promise<RouteResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !isValidCoords(origin) || !isValidCoords(destination)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: 'TWO_WHEELER', // los repartidores andan en moto
        regionCode: 'AR',
      }),
    });
    if (!res.ok) {
      // 429 = se llegó al tope diario: es esperable, no un bug — no se reporta.
      if (res.status !== 429) {
        Sentry.captureMessage(`Routes API respondió ${res.status}`, { level: 'warning', tags: { area: 'route-distance' } });
      }
      return null;
    }
    const data = await res.json();
    const route = data?.routes?.[0];
    const distanceM = Number(route?.distanceMeters);
    const durationS = parseInt(String(route?.duration ?? ''), 10); // viene como "845s"
    if (!Number.isFinite(distanceM) || distanceM <= 0 || !Number.isFinite(durationS)) return null;
    return { distanceM: Math.round(distanceM), durationS };
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') {
      Sentry.captureException(error, { tags: { area: 'route-distance' } });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
