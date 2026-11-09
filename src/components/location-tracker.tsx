'use client';

import { useEffect, useRef } from 'react';
import { useFirestore } from '@/lib/firebase';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { distanceMeters, geoErrorMessage } from '@/lib/geo';

interface LocationTrackerProps {
    orderId: string;
    isDriver: boolean;
    status: string;
}

// Fase RR: también se trackea 'En camino' (yendo a la tienda) — antes solo 'En reparto',
// así que la rama del mapa que dibuja repartidor→tienda nunca se renderizaba y el
// comprador no veía nada hasta que el pedido salía del local.
const TRACKED_STATUSES = ['En camino', 'En reparto'];

// Throttle de escrituras (Fase RR). watchPosition con enableHighAccuracy entrega fixes a
// ~1 por segundo en movimiento; escribir cada uno era ~900 writes de Firestore por
// entrega de 15 min, y cada write se multiplica en lecturas hacia todos los que miran la
// orden (comprador/tienda/admin). Con "cada 30 m o cada 15 s" quedan ~60-80 por entrega,
// que para un pin en un mapa de pueblo es visualmente lo mismo.
// PERF-004 (auditoría oct 2026): el piso de 5 s / 30 m daba 70-180 writes por entrega (una
// moto a 20-30 km/h recorre 30 m cada 4-5 s) y cada write despertaba a 5-8 listeners del
// DOC DEL PEDIDO (detalle, chat-listener ×3 roles, dashboard admin…): 75-90 % del costo por
// pedido. Dos cambios: (1) piso 10 s / 50 m (≈40-60 writes por entrega, el pin se ve igual
// en un mapa de pueblo); (2) la posición vive en `orders/{id}/live/driver`, un subdocumento
// que SOLO escucha quien mira el mapa — el doc del pedido deja de cambiar con cada fix.
const HEARTBEAT_MS = 20_000;   // aunque esté quieto, refrescar lastUpdate cada tanto
const MIN_MOVE_METERS = 50;    // o si se movió esto...
const MIN_MOVE_MS = 10_000;    // ...pero nunca más seguido que esto

// Ruta del subdocumento de posición en vivo (compartida con el detalle del pedido y los
// dos caminos que marcan 'Entregado', que lo borran).
export const liveDriverRef = (firestore: Firestore, orderId: string) => doc(firestore, 'orders', orderId, 'live', 'driver');

// A nivel módulo: con varios pedidos activos hay un tracker por pedido (el panel monta
// uno por cada orden en curso, y el detalle monta otro) — los toasts tienen que salir UNA
// vez, no uno por tracker (prueba del 9/11: el "Error GPS" salió dos veces).
let lastGpsToastAt = 0;
let lastGpsErrorToastAt = 0;
let gpsHadError = false;

export function LocationTracker({ orderId, isDriver, status }: LocationTrackerProps): null {
    const firestore = useFirestore();
    const { toast } = useToast();
    // Última escritura hecha (no el último fix): contra esto se mide el throttle.
    const lastWriteRef = useRef<{ t: number; latitude: number; longitude: number } | null>(null);
    // Evita repetir toasts: watchPosition puede disparar el callback de error muchas veces.
    const notifiedRef = useRef<'ok' | 'error' | null>(null);

    useEffect(() => {
        if (!isDriver || !TRACKED_STATUSES.includes(status) || !firestore) return;

        if (!('geolocation' in navigator)) {
            console.error('Geolocalización no soportada');
            return;
        }

        let watchId: number | null = null;
        // Con el permiso DENEGADO el watch queda muerto: el navegador no lo reanuda solo
        // aunque después se habilite la ubicación. Antes el pedido seguía sin GPS hasta el
        // próximo cambio de estado (prueba del 9/11: GPS prendido tarde → el comprador no
        // veía la moto en el tramo a la tienda). Ahora se reintenta al habilitar el permiso
        // y al volver a la app (ej. desde los Ajustes del teléfono).
        let denied = false;
        let cancelled = false;

        const onPosition = async (position: GeolocationPosition) => {
            denied = false;
            const { latitude, longitude } = position.coords;

            // El "GPS Activo" recién cuando de verdad hay un fix — antes se mostraba
            // al montar, incluso con el permiso denegado (y después llegaba el error).
            if (notifiedRef.current !== 'ok') {
                notifiedRef.current = 'ok';
                if (gpsHadError || Date.now() - lastGpsToastAt > 60_000) {
                    gpsHadError = false;
                    lastGpsToastAt = Date.now();
                    toast({ title: 'GPS activo', description: 'El cliente ya ve tu ubicación en el mapa.' });
                }
            }

            const now = Date.now();
            const last = lastWriteRef.current;
            if (last) {
                const elapsed = now - last.t;
                if (elapsed < MIN_MOVE_MS) return;
                const moved = distanceMeters(last, { latitude, longitude });
                if (moved < MIN_MOVE_METERS && elapsed < HEARTBEAT_MS) return;
            }
            lastWriteRef.current = { t: now, latitude, longitude };

            try {
                await setDoc(liveDriverRef(firestore, orderId), {
                    latitude,
                    longitude,
                    lastUpdate: new Date().toISOString(),
                });
            } catch (error) {
                console.error('Error guardando ubicación:', error);
            }
        };

        const onError = (error: GeolocationPositionError) => {
            // warn y no error: es un estado del teléfono (permiso, señal), no un bug.
            console.warn('GPS sin señal o sin permiso:', error.code, error.message);
            if (error.code === 1) denied = true;
            gpsHadError = true;
            if (notifiedRef.current === 'error') return;
            notifiedRef.current = 'error';
            if (Date.now() - lastGpsErrorToastAt < 60_000) return;
            lastGpsErrorToastAt = Date.now();
            toast({
                variant: 'destructive',
                title: 'Sin GPS',
                description: error.code === 1
                    ? 'El cliente no ve tu ubicación. Activá la ubicación para esta app y volvé a esta pantalla: se reconecta sola.'
                    : geoErrorMessage(error),
            });
        };

        const startWatch = () => {
            if (cancelled) return;
            if (watchId != null) navigator.geolocation.clearWatch(watchId);
            notifiedRef.current = null;
            watchId = navigator.geolocation.watchPosition(onPosition, onError, {
                enableHighAccuracy: true, // GPS real (batería), no solo WiFi
                timeout: 10000,
                maximumAge: 5000,
            });
        };

        startWatch();

        const onVisible = () => {
            if (document.visibilityState === 'visible' && denied) startWatch();
        };
        document.addEventListener('visibilitychange', onVisible);

        let permission: PermissionStatus | null = null;
        navigator.permissions?.query({ name: 'geolocation' as PermissionName })
            .then((p) => {
                if (cancelled) return;
                permission = p;
                p.onchange = () => { if (p.state === 'granted' && denied) startWatch(); };
            })
            .catch(() => { /* navegadores sin Permissions API: queda el reintento al volver */ });

        return () => {
            cancelled = true;
            if (watchId != null) navigator.geolocation.clearWatch(watchId);
            document.removeEventListener('visibilitychange', onVisible);
            if (permission) permission.onchange = null;
            lastWriteRef.current = null;
            notifiedRef.current = null;
        };
    }, [firestore, orderId, isDriver, status, toast]);

    // Componente invisible, no renderiza nada visual
    return null;
}
