'use client';

// Pin ajustable en mapa (Fase RR) — el "gold standard" de Rappi/PedidosYa que estaba
// anotado como pendiente desde la Fase V: hasta ahora la lectura CRUDA del GPS se
// guardaba tal cual, sin forma de corregirla. Si el teléfono triangulaba por WiFi y le
// erraba por 300 m, ese error viajaba derecho al pedido y el repartidor iba a la casa
// equivocada.
//
// Se usa en: checkout-dialog (coords del pedido), /profile (direcciones guardadas) y
// /my-store/edit (ubicación del local — antes el dueño tenía que estar físicamente ahí).
//
// El mapa real vive en location-picker-map.tsx y se carga con dynamic/ssr:false
// (Leaflet no sobrevive al SSR). El wrapper además contiene los z-index internos de
// Leaflet (panes con z-index 400+) para que el mapa no tape el contenido de un Dialog.

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { GeoCoords } from '@/lib/geo';
import { cn } from '@/lib/utils';

const LocationPickerMap = dynamic(() => import('./location-picker-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

interface LocationPickerProps {
  value: GeoCoords | null;
  onChange: (coords: GeoCoords) => void;
  className?: string;
  /** Texto de ayuda abajo del mapa. Pasar null para ocultarlo. */
  hint?: string | null;
}

export function LocationPicker({
  value,
  onChange,
  className,
  hint = 'Tocá el mapa o arrastrá el pin 📍 hasta la entrada exacta.',
}: LocationPickerProps) {
  return (
    <div className="space-y-1.5">
      <div className={cn('relative z-0 h-48 w-full overflow-hidden rounded-lg border', className)}>
        <LocationPickerMap value={value} onChange={onChange} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {value && typeof value.accuracy === 'number' && value.accuracy > 25 && (
        <p className="text-xs text-warning">
          El GPS reportó ±{Math.round(value.accuracy)} m de precisión — verificá el pin y ajustalo si hace falta.
        </p>
      )}
    </div>
  );
}
