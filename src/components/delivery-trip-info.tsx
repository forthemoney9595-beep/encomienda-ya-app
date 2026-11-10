'use client';

import { useEffect, useState } from 'react';
import { MapPinned, Bike, Clock } from 'lucide-react';
import { formatDistance } from '@/lib/geo';
import { formatTravelMinutes } from '@/lib/delivery-zones';
import { cn } from '@/lib/utils';

// Zona + distancia + tiempo del viaje tienda→cliente (9/11/2026). Es lo que el repartidor
// usa para decidir si toma un pedido: zona aproximada (nunca la dirección exacta antes de
// aceptar), km por ruta y minutos en moto. Si el pedido no tiene ruta (Google no respondió,
// o es anterior a esto) muestra la línea recta y lo dice.
export interface DeliveryTripInfoProps {
  zone?: string | null;
  distanceM?: number | null;
  durationS?: number | null;
  source?: 'route' | 'line' | null;
  className?: string;
  /** 'lg' (rediseño en vidrio): la zona en letra de cartel grande, para la tarjeta del pool. */
  size?: 'md' | 'lg';
}

export function DeliveryTripInfo({ zone, distanceM, durationS, source, className, size = 'md' }: DeliveryTripInfoProps) {
  const hasDistance = typeof distanceM === 'number' && Number.isFinite(distanceM);
  if (!zone && !hasDistance) return null;
  const byRoute = source === 'route';
  const lg = size === 'lg';

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <MapPinned className={cn('mt-0.5 h-5 w-5 shrink-0', lg ? 'text-primary' : 'text-info')} aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Entregar en</p>
        <p
          className={lg ? 'mt-0.5 break-words font-headline text-[1.75rem] font-extrabold leading-none' : 'font-semibold leading-tight'}
          data-testid="trip-zone"
        >
          {zone || 'Zona sin identificar'}
        </p>
        {hasDistance && (
          <p className={cn('flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground', lg ? 'mt-1.5' : 'mt-0.5')}>
            <Bike className="h-4 w-4" aria-hidden />
            {byRoute
              ? <>{formatDistance(distanceM!)} por ruta{typeof durationS === 'number' && <> · ~{formatTravelMinutes(durationS)} en moto</>}</>
              : <>≈ {formatDistance(distanceM!)} en línea recta</>}
          </p>
        )}
      </div>
    </div>
  );
}

// "Llega en ~X min" para el comprador (9/11/2026). Sale del tiempo de viaje en moto que
// calculó Google al crear el pedido + la hora en que el repartidor lo retiró. Antes de que
// salga de la tienda muestra cuánto tarda el viaje; durante el viaje, cuánto falta. Es una
// estimación honesta: no sigue el GPS del repartidor en vivo, por eso dice "~".
export function ArrivalEstimate({ status, durationS, pickedUpAt }: {
  status: string;
  durationS?: number | null;
  pickedUpAt?: { toMillis?: () => number } | Date | string | number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'En reparto') return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [status]);

  if (typeof durationS !== 'number' || !Number.isFinite(durationS) || durationS <= 0) return null;

  if (status === 'En reparto') {
    const picked = pickedUpAt == null ? NaN
      : typeof (pickedUpAt as { toMillis?: () => number }).toMillis === 'function'
        ? (pickedUpAt as { toMillis: () => number }).toMillis()
        : new Date(pickedUpAt as Date | string | number).getTime();
    if (!Number.isFinite(picked)) {
      return <ArrivalLine strong={`Llega en ~${formatTravelMinutes(durationS)}`} />;
    }
    const leftS = (picked + durationS * 1000 - now) / 1000;
    return leftS > 60
      ? <ArrivalLine strong={`Llega en ~${formatTravelMinutes(leftS)}`} />
      : <ArrivalLine strong="Está por llegar" />;
  }
  if (['En preparación', 'Listo para recoger', 'En camino'].includes(status)) {
    return <ArrivalLine text={`Cuando salga de la tienda, el viaje tarda ~${formatTravelMinutes(durationS)}.`} />;
  }
  return null;
}

function ArrivalLine({ strong, text }: { strong?: string; text?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm" data-testid="arrival-estimate">
      <Clock className="h-4 w-4 text-info" aria-hidden />
      {strong ? <span className="font-semibold">{strong}</span> : <span className="text-muted-foreground">{text}</span>}
    </p>
  );
}
