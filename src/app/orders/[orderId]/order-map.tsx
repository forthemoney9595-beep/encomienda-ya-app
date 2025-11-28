'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Store, Home } from 'lucide-react';
import ReactDOMServer from 'react-dom/server';
import type { Order } from '@/lib/order-service';

// Fix para el ícono de marcador por defecto que a veces no carga
// @ts-ignore
delete (L.Icon.Default.prototype)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


interface OrderMapProps {
    order: Order;
}

// Función para crear íconos personalizados
const createIcon = (icon: React.ReactElement, className: string) => {
  return L.divIcon({
    html: ReactDOMServer.renderToString(
        <div className={`p-2 rounded-full shadow-lg ${className}`}>
            {icon}
        </div>
    ),
    className: 'bg-transparent border-0',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const storeIcon = createIcon(<Store className="h-4 w-4 text-white" />, 'bg-primary');
const customerIcon = createIcon(<Home className="h-4 w-4 text-white" />, 'bg-destructive');


export default function OrderMap({ order }: OrderMapProps) {
    const { storeCoords, customerCoords, storeName, customerName, shippingAddress, status } = order;

    if (!storeCoords || !customerCoords) {
        return <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">Faltan datos de ubicación para este pedido.</div>;
    }

    // @ts-ignore - Leaflet types mismatch workaround
    const storePosition: [number, number] = [storeCoords.latitude, storeCoords.longitude];
    // @ts-ignore - Leaflet types mismatch workaround
    const customerPosition: [number, number] = [customerCoords.latitude, customerCoords.longitude];
    
    const bounds = L.latLngBounds(storePosition, customerPosition);

    const polylineOptions = { color: 'hsl(var(--primary))', weight: 5 };

    return (
        <MapContainer
            bounds={bounds}
            boundsOptions={{ padding: [50, 50] }}
            scrollWheelZoom={false}
            className="h-full w-full rounded-lg"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <Marker position={storePosition} icon={storeIcon}>
                <Popup>
                    <strong>Tienda:</strong> {storeName}
                </Popup>
            </Marker>
            
            <Marker position={customerPosition} icon={customerIcon}>
                <Popup>
                    <strong>Cliente:</strong> {customerName || shippingAddress.name}
                </Popup>
            </Marker>

            {status === 'En reparto' && (
                <Polyline positions={[storePosition, customerPosition]} pathOptions={polylineOptions} />
            )}
        </MapContainer>
    );
}