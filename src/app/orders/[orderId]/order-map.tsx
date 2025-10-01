'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { Store, Home } from 'lucide-react';
import ReactDOMServer from 'react-dom/server';

interface OrderMapProps {
    storeCoords: { lat: number; lon: number };
    customerCoords: { lat: number; lon: number };
    storeName: string;
    customerName: string;
}

// Custom hook to fit map bounds
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
    const map = useMap();
    useEffect(() => {
        if(bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [map, bounds]);
    return null;
}

// Function to create custom icons
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


export default function OrderMap({ storeCoords, customerCoords, storeName, customerName }: OrderMapProps) {
    if (!storeCoords || !customerCoords) {
        return <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">Faltan datos de coordenadas.</div>;
    }

    const storePosition: L.LatLngExpression = [storeCoords.lat, storeCoords.lon];
    const customerPosition: L.LatLngExpression = [customerCoords.lat, customerCoords.lon];

    const bounds: L.LatLngBoundsExpression = L.latLngBounds(storePosition, customerPosition);
    
    return (
        <MapContainer
            center={storePosition}
            zoom={13}
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
                    <strong>Cliente:</strong> {customerName}
                </Popup>
            </Marker>
            <FitBounds bounds={bounds} />
        </MapContainer>
    );
}
