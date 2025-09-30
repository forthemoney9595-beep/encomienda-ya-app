'use client';

import 'leaflet/dist/leaflet.css';
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Skeleton } from '@/components/ui/skeleton';

import type { OrderStatus } from '@/lib/order-service';

// Leaflet's default icons can be problematic with bundlers like Webpack.
// This is a common workaround to fix them.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default,
  iconUrl: require('leaflet/dist/images/marker-icon.png').default,
  shadowUrl: require('leaflet/dist/images/marker-shadow.png').default,
});

const deliveryPersonIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWJpY3ljbGUiPjxjaXJjbGUgY3g9IjUuNSIgY3k9IjQuNSIgcj0iMy41Ii8+PGNpcmNsZSBjeD0iMTguNSIgY3k9IjQuNSIgcj0iMy41Ii8+PHBhdGggZD0iTTIgMTVsMi43NiAxLjk0YTQgNCAwIDAgMCA1IDI4IDAgMCAxLTIgMS4zN0w2IDE2Ii8+PHBhdGggZD0iTTIgMTVoMSA5LjUgMUwxNSA5bC0yLTQuNSIvPjxsaW5lIHgxPSIxOCIgeDI9IjYiIHkxPSI5IiB5Mj0iMTYiLz48L3N2Zz4=',
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -40]
});

const storeIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveDoiMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXN0b3JlIj48cGF0aCBkPSJtMiA3IDQtMS4yQTYgNiAwIDAgMSAxMSA4djEwYy0uOSAwLTEuNjEuMy0yLjI0LjgzLS41My40My0xLjExIDEuMzQtMS4xMSAyLjE3IDAgLjg0LjU4IDEuNzQgMS4xMSAyLjE3LjYzLjUzIDEuMzUgLjgzIDIuMjQuODNzMS42MS0uMyAyLjI0LS44M2MxLjEyLS45MSAxLjMxLTIuNjYgLjQzLTMuOTgtLjE1ləş-.23-LjMwLS40Mi0uNDgtLjU5QTE1IDkuNSAwIDAgMCAxMyA5di43YTYgNiAwIDAgMCA1LjIgMS42N0w2MS45NCAyMnoiLz48cGF0aCBkPSJtMTYgMjItMSA0LTQgMVY4YTQgNCAwIDAgMSAuOS0yLjQ4Ii8+PC9zdmc+',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32]
});

const homeIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZGg0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWhvbWUiPjxwYXRoIGQ9Im0zIDkgOS03IDkgN3YxMWEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnoiLz48cG9seWxpbmUgcG9pbnRzPSI5IDIyIDkgMTIgMTUgMTIgMTUgMjIiLz48L3N2Zz4=',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32]
});


interface OrderMapProps {
  orderStatus: OrderStatus;
  storeCoords: { lat: number, lon: number };
  customerCoords: { lat: number, lon: number };
}

function MapUpdater({ center }: { center: L.LatLngExpression }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
}

export function OrderMap({ orderStatus, storeCoords, customerCoords }: OrderMapProps) {
  const [driverPosition, setDriverPosition] = useState({ lat: storeCoords.lat, lng: storeCoords.lon });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const storePos: L.LatLngExpression = [storeCoords.lat, storeCoords.lon];
  const customerPos: L.LatLngExpression = [customerCoords.lat, customerCoords.lon];
  
  const bounds = L.latLngBounds(storePos, customerPos);
  const center = bounds.getCenter();

  useEffect(() => {
    if (orderStatus !== 'En reparto') return;

    const totalSteps = 100; // Number of steps for the simulation
    const duration = 60000; // 1 minute in milliseconds
    const stepDuration = duration / totalSteps;
    
    const latStep = (customerCoords.lat - storeCoords.lat) / totalSteps;
    const lonStep = (customerCoords.lon - storeCoords.lon) / totalSteps;
    
    let currentStep = 0;

    const interval = setInterval(() => {
        if (currentStep < totalSteps) {
            setDriverPosition(prev => ({
                lat: prev.lat + latStep,
                lng: prev.lng + lonStep,
            }));
            currentStep++;
        } else {
            setDriverPosition({ lat: customerCoords.lat, lng: customerCoords.lon });
            clearInterval(interval);
        }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [orderStatus, storeCoords, customerCoords]);


  if (!isClient) {
    return <Skeleton className="h-full w-full rounded-md" />;
  }
  
  const driverPos: L.LatLngExpression = [driverPosition.lat, driverPosition.lng];

  return (
      <MapContainer center={center} zoom={13} bounds={bounds} scrollWheelZoom={true} style={{ height: '100%', width: '100%', borderRadius: 'var(--radius)' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={center} />
        <Marker position={storePos} icon={storeIcon}>
          <Popup>Punto de Recogida</Popup>
        </Marker>
        <Marker position={customerPos} icon={homeIcon}>
          <Popup>Tu Dirección</Popup>
        </Marker>
        {orderStatus === 'En reparto' && (
             <Marker position={driverPos} icon={deliveryPersonIcon}>
                <Popup>Repartidor</Popup>
            </Marker>
        )}
      </MapContainer>
  );
}
