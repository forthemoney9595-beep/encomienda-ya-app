'use client';

// Mapa interno del LocationPicker (Fase RR). NO importar directo: usar
// components/location-picker.tsx, que lo carga con dynamic + ssr:false
// (Leaflet toca `window` y explota en SSR).

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { TINOGASTA_CENTER, type GeoCoords } from '@/lib/geo';

// Mismo estilo de ícono que order-map.tsx (divIcon con emoji, sin assets externos).
const pinIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div style="
      background-color: #8B5CF6;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: grab;
  ">📍</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

interface LocationPickerMapProps {
  value: GeoCoords | null;
  onChange: (coords: GeoCoords) => void;
}

// Tocar el mapa mueve el pin ahí (además del drag) — en celular es más cómodo que
// arrastrar fino, y permite marcar la ubicación aunque el GPS esté denegado/apagado.
function ClickToPlace({ onChange }: { onChange: (c: GeoCoords) => void }): null {
  useMapEvents({
    click(e) {
      onChange({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

// Re-centra SOLO si el pin quedó fuera de la vista (p. ej. recién llegó el fix del GPS).
// Un drag dentro del encuadre no mueve la cámara — si re-centráramos en cada cambio, el
// mapa saltaría abajo del dedo del usuario mientras arrastra.
function KeepPinVisible({ value }: { value: GeoCoords | null }): null {
  const map = useMap();
  useEffect(() => {
    if (!value) return;
    const latlng = L.latLng(value.latitude, value.longitude);
    if (!map.getBounds().pad(-0.15).contains(latlng)) {
      map.setView(latlng, Math.max(map.getZoom(), 16));
    }
  }, [value, map]);
  return null;
}

export default function LocationPickerMap({ value, onChange }: LocationPickerMapProps) {
  const center: [number, number] = value
    ? [value.latitude, value.longitude]
    : [TINOGASTA_CENTER.latitude, TINOGASTA_CENTER.longitude];

  return (
    <MapContainer center={center} zoom={value ? 16 : 14} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPlace onChange={onChange} />
      <KeepPinVisible value={value} />
      {value && (
        <>
          {/* Círculo de precisión: si el fix vino impreciso (WiFi/antena), que se VEA.
              Un ajuste manual del pin no trae accuracy y el círculo desaparece. */}
          {typeof value.accuracy === 'number' && value.accuracy > 25 && (
            <Circle
              center={[value.latitude, value.longitude]}
              radius={value.accuracy}
              pathOptions={{ color: '#f59e0b', weight: 1, fillOpacity: 0.08 }}
            />
          )}
          <Marker
            position={[value.latitude, value.longitude]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const pos = (e.target as L.Marker).getLatLng();
                // Sin accuracy: el pin ajustado a mano ES la posición confirmada.
                onChange({ latitude: pos.lat, longitude: pos.lng });
              },
            }}
          />
        </>
      )}
    </MapContainer>
  );
}
