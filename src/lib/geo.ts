// Utilidades de geolocalización compartidas (Fase RR).
//
// Antes de este módulo, la captura de GPS estaba TRIPLICADA (checkout-dialog, /profile,
// /my-store/edit) con los mismos tres defectos en cada copia: sin `timeout` (el spinner
// podía colgarse infinito), sin distinguir el tipo de error (permiso denegado vs GPS
// apagado vs demora daban el mismo mensaje), y descartando `accuracy` (un fix de 5 m y
// una triangulación WiFi de 5 km se guardaban con la misma confianza).
//
// Es un módulo puro sin imports de cliente: el servidor (p. ej. /api/orders/create)
// puede importar isValidCoords/distanceMeters sin arrastrar nada del navegador.

export interface GeoCoords {
  latitude: number;
  longitude: number;
  /** Precisión reportada por el dispositivo, en metros. Opcional (datos viejos no la tienen). */
  accuracy?: number;
}

// Centro de Tinogasta — punto de partida del mapa cuando todavía no hay ninguna
// coordenada (mismo valor que usa el seed).
export const TINOGASTA_CENTER: GeoCoords = { latitude: -28.0639, longitude: -67.5683 };

/** Valida forma y rango. Sirve tanto en el cliente como en las API routes (Admin SDK). */
export function isValidCoords(c: unknown): c is { latitude: number; longitude: number } {
  if (!c || typeof c !== 'object') return false;
  const { latitude, longitude } = c as Record<string, unknown>;
  return (
    typeof latitude === 'number' && Number.isFinite(latitude) &&
    typeof longitude === 'number' && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

/** Mensaje en criollo según el tipo de error del navegador (antes todos daban lo mismo). */
export function geoErrorMessage(error?: { code?: number }): string {
  switch (error?.code) {
    case 1: // PERMISSION_DENIED
      return 'Permiso de ubicación denegado. Habilitalo para este sitio en la configuración del navegador y volvé a intentar.';
    case 2: // POSITION_UNAVAILABLE
      return 'No se pudo determinar tu ubicación. Revisá que el GPS del teléfono esté prendido.';
    case 3: // TIMEOUT
      return 'El GPS tardó demasiado en responder. Probá de nuevo, mejor a cielo abierto.';
    default:
      return 'No pudimos obtener tu ubicación.';
  }
}

/**
 * getCurrentPosition como promesa, con timeout (15 s) para que el spinner nunca quede
 * colgado, y conservando `accuracy`. Rechaza con un Error cuyo mensaje ya viene listo
 * para mostrar en un toast.
 */
export function capturePosition(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Tu navegador no soporta geolocalización.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // OJO: nunca incluir claves con valor `undefined` — estos objetos terminan en
        // updateDoc/arrayUnion y el SDK de Firestore rechaza `undefined` de plano.
        const coords: GeoCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        if (Number.isFinite(position.coords.accuracy)) {
          coords.accuracy = Math.round(position.coords.accuracy);
        }
        resolve(coords);
      },
      (error) => {
        reject(Object.assign(new Error(geoErrorMessage(error)), { code: error.code }));
      },
      // maximumAge 30 s: un fix reciente del sistema alcanza y responde al toque.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "850 m" / "1,2 km" (formato es-AR). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Deep link de navegación a Google Maps. En un celular con la app instalada la abre
 * directo en modo direcciones; en desktop abre el sitio. Es el mismo mecanismo que usan
 * los repartidores de Rappi/PedidosYa: la app de la plataforma muestra el pedido, la
 * navegación real la hace la app de mapas del teléfono.
 */
export function gmapsDirectionsUrl(dest: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.latitude},${dest.longitude}&travelmode=driving`;
}
