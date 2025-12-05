'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface LocationTrackerProps {
    orderId: string;
    isDriver: boolean;
    status: string;
}

// ✅ CORRECCIÓN: Agregamos ": null" para satisfacer a TypeScript
export function LocationTracker({ orderId, isDriver, status }: LocationTrackerProps): null {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [tracking, setTracking] = useState(false);

    useEffect(() => {
        // Solo rastreamos si:
        // 1. Es el repartidor asignado
        // 2. El pedido está "En reparto"
        // 3. Tenemos conexión a la DB
        if (!isDriver || status !== 'En reparto' || !firestore) {
            setTracking(false);
            return;
        }

        if (!('geolocation' in navigator)) {
            console.error("Geolocalización no soportada");
            return;
        }

        console.log("🛰️ Iniciando rastreo GPS...");
        setTracking(true);
        toast({ title: "GPS Activo", description: "Compartiendo ubicación en tiempo real." });

        // watchPosition: Se ejecuta cada vez que el GPS detecta movimiento
        const watchId = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                
                try {
                    // Guardamos la ubicación en el documento de la orden
                    // Campo: 'driverCoords'
                    const orderRef = doc(firestore, 'orders', orderId);
                    await updateDoc(orderRef, {
                        driverCoords: {
                            latitude,
                            longitude,
                            lastUpdate: new Date().toISOString()
                        }
                    });
                    console.log(`📍 Ubicación actualizada: ${latitude}, ${longitude}`);
                } catch (error) {
                    console.error("Error guardando ubicación:", error);
                }
            },
            (error) => {
                console.error("Error de GPS:", error);
                toast({ variant: 'destructive', title: "Error GPS", description: "No podemos acceder a tu ubicación." });
            },
            {
                enableHighAccuracy: true, // Usar GPS real (batería), no solo Wifi
                timeout: 10000,
                maximumAge: 0
            }
        );

        // Limpieza: Cuando el componente se desmonta (o cambia estado), dejamos de rastrear
        return () => {
            console.log("🛑 Deteniendo rastreo GPS...");
            navigator.geolocation.clearWatch(watchId);
            setTracking(false);
        };

    }, [firestore, orderId, isDriver, status, toast]);

    // Este componente es invisible, no renderiza nada visual
    return null; 
}