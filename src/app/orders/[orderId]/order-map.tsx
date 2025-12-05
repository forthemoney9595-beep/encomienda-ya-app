'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Order } from '@/lib/order-service';

// --- CONFIGURACIÓN DE ÍCONOS ---
// Leaflet tiene problemas con los iconos por defecto en Next.js. 
// Definimos iconos personalizados simples.

const createCustomIcon = (color: string, emoji: string) => {
    return L.divIcon({
        className: 'custom-icon',
        html: `<div style="
            background-color: ${color};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        ">${emoji}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15], // Centro del icono
        popupAnchor: [0, -15]
    });
};

const storeIcon = createCustomIcon('#3b82f6', '🏪'); // Azul
const customerIcon = createCustomIcon('#ef4444', '🏠'); // Rojo
const driverIcon = createCustomIcon('#22c55e', '🛵'); // Verde (Moto)

// Componente auxiliar para re-centrar el mapa cuando se mueve la moto
// ✅ CORRECCIÓN: Agregamos el tipo de retorno ": null"
function MapUpdater({ center }: { center: [number, number] }): null {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, map.getZoom()); // Animación suave
        }
    }, [center, map]);
    return null;
}

interface OrderMapProps {
    order: Order;
}

export default function OrderMap({ order }: OrderMapProps) {
    // Coordenadas base (Tienda y Cliente)
    const storePos: [number, number] | null = order.storeCoords 
        ? [order.storeCoords.latitude, order.storeCoords.longitude] 
        : null;
        
    const customerPos: [number, number] | null = order.customerCoords 
        ? [order.customerCoords.latitude, order.customerCoords.longitude] 
        : null;

    // Coordenadas dinámicas del Repartidor
    // Firestore puede devolver el objeto driverCoords dentro de la orden
    const driverCoords = (order as any).driverCoords;
    const driverPos: [number, number] | null = driverCoords 
        ? [driverCoords.latitude, driverCoords.longitude] 
        : null;

    if (!storePos || !customerPos) {
        return <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-500">Faltan coordenadas</div>;
    }

    // Centro inicial: La tienda
    const initialCenter = storePos;

    return (
        <MapContainer center={initialCenter} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* MARCADOR TIENDA */}
            <Marker position={storePos} icon={storeIcon}>
                <Popup>Tienda: {order.storeName}</Popup>
            </Marker>

            {/* MARCADOR CLIENTE */}
            <Marker position={customerPos} icon={customerIcon}>
                <Popup>Entrega: {order.customerName}</Popup>
            </Marker>

            {/* MARCADOR REPARTIDOR (DINÁMICO) */}
            {driverPos && (
                <>
                    <Marker position={driverPos} icon={driverIcon}>
                        <Popup>Repartidor en camino</Popup>
                    </Marker>
                    {/* Si la orden está en reparto, la cámara sigue a la moto */}
                    {order.status === 'En reparto' && <MapUpdater center={driverPos} />}
                </>
            )}
        </MapContainer>
    );
}