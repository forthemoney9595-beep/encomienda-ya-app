'use client';

import { useEffect, useRef } from 'react';
import { useFirestore } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
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
const HEARTBEAT_MS = 15_000;   // aunque esté quieto, refrescar lastUpdate cada tanto
const MIN_MOVE_METERS = 30;    // o si se movió esto...
const MIN_MOVE_MS = 5_000;     // ...pero nunca más seguido que esto

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

        const watchId = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;

                // El "GPS Activo" recién cuando de verdad hay un fix — antes se mostraba
                // al montar, incluso con el permiso denegado (y después llegaba el error).
                if (notifiedRef.current !== 'ok') {
                    notifiedRef.current = 'ok';
                    toast({ title: 'GPS Activo', description: 'Compartiendo ubicación en tiempo real.' });
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
                    const orderRef = doc(firestore, 'orders', orderId);
                    await updateDoc(orderRef, {
                        driverCoords: {
                            latitude,
                            longitude,
                            lastUpdate: new Date().toISOString(),
                        },
                    });
                } catch (error) {
                    console.error('Error guardando ubicación:', error);
                }
            },
            (error) => {
                console.error('Error de GPS:', error);
                if (notifiedRef.current === 'error') return;
                notifiedRef.current = 'error';
                toast({ variant: 'destructive', title: 'Error GPS', description: geoErrorMessage(error) });
            },
            {
                enableHighAccuracy: true, // GPS real (batería), no solo WiFi
                timeout: 10000,
                maximumAge: 5000,
            }
        );

        return () => {
            navigator.geolocation.clearWatch(watchId);
            lastWriteRef.current = null;
            notifiedRef.current = null;
        };
    }, [firestore, orderId, isDriver, status, toast]);

    // Componente invisible, no renderiza nada visual
    return null;
}
