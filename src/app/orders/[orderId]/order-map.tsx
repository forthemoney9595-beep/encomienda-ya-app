'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Order } from '@/lib/order-service';

// --- CONFIGURACIÓN DE ÍCONOS ---
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
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });
};

const storeIcon = createCustomIcon('#3b82f6', '🏪'); // Azul
const customerIcon = createCustomIcon('#ef4444', '🏠'); // Rojo
const driverIcon = createCustomIcon('#22c55e', '🛵'); // Verde (Moto)

// Componente auxiliar para re-centrar el mapa
function MapUpdater({ center }: { center: [number, number] }): null {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, map.getZoom());
        }
    }, [center, map]);
    return null;
}

interface OrderMapProps {
    order: Order;
}

export default function OrderMap({ order }: OrderMapProps) {
    // Coordenadas base
    const storePos: [number, number] | null = order.storeCoords 
        ? [order.storeCoords.latitude, order.storeCoords.longitude] 
        : null;
        
    const customerPos: [number, number] | null = order.customerCoords 
        ? [order.customerCoords.latitude, order.customerCoords.longitude] 
        : null;

    // Coordenadas dinámicas del Repartidor
    const driverCoords = (order as any).driverCoords;
    const driverPos: [number, number] | null = driverCoords 
        ? [driverCoords.latitude, driverCoords.longitude] 
        : null;

    if (!storePos || !customerPos) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-500 flex-col gap-2">
                <p>Esperando coordenadas...</p>
                <span className="text-xs">Tienda: {storePos ? 'OK' : 'Falta'} | Cliente: {customerPos ? 'OK' : 'Falta'}</span>
            </div>
        );
    }

    // Configuración de la Ruta Visual
    const routeColor = '#3b82f6'; // Azul Tienda -> Cliente
    const driverPathColor = '#6b7280'; // Gris Repartidor -> Destino

    return (
        <MapContainer center={storePos} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* ✅ LÍNEA DE RUTA: Conecta Tienda con Cliente */}
            <Polyline 
                positions={[storePos, customerPos]} 
                pathOptions={{ color: routeColor, weight: 4, opacity: 0.7 }} 
            />

            {/* ✅ LÍNEA DINÁMICA: Conecta Repartidor con su destino actual */}
            {driverPos && (
                <Polyline 
                    positions={[
                        driverPos, 
                        // Si está 'En camino' (a tienda) conecta con Tienda, si está 'En reparto' (a cliente) conecta con Cliente
                        order.status === 'En camino' ? storePos : customerPos
                    ]} 
                    pathOptions={{ color: driverPathColor, weight: 3, dashArray: '10, 10', opacity: 0.6 }} 
                />
            )}

            {/* MARCADOR TIENDA */}
            <Marker position={storePos} icon={storeIcon}>
                <Popup>
                    <strong>Tienda:</strong> {order.storeName}<br/>
                    <span className="text-xs">Punto de Retiro</span>
                </Popup>
            </Marker>

            {/* MARCADOR CLIENTE */}
            <Marker position={customerPos} icon={customerIcon}>
                <Popup>
                    <strong>Cliente:</strong> {order.customerName}<br/>
                    <span className="text-xs">Punto de Entrega</span>
                </Popup>
            </Marker>

            {/* MARCADOR REPARTIDOR */}
            {driverPos && (
                <>
                    <Marker position={driverPos} icon={driverIcon}>
                        <Popup>Repartidor en movimiento</Popup>
                    </Marker>
                    {/* La cámara sigue al repartidor si está activo */}
                    {(order.status === 'En camino' || order.status === 'En reparto') && (
                        <MapUpdater center={driverPos} />
                    )}
                </>
            )}
        </MapContainer>
    );
}