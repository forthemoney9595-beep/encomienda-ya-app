'use client';

import { Clock, Eye, Store as StoreIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/price-pill';
import { DeliveryTripInfo } from '@/components/delivery-trip-info';
import { distanceMeters, isValidCoords } from '@/lib/geo';
import { driverNetForOrder } from '@/lib/money';
import { money } from '@/lib/format-money';
import { cn } from '@/lib/utils';

type Coords = { latitude: number; longitude: number } | null | undefined;

/** Un pedido del POOL tal como lo puede leer el repartidor (sin la PII del cliente). */
export interface DriverPoolOrder {
  id: string;
  storeName?: string;
  storeAddress?: string;
  userId?: string;
  status?: string;
  paymentMethod?: string;
  deliveryFee?: number;
  total?: number;
  storeCoords?: Coords;
  // Solo los pedidos LEGACY traen las coords del cliente en el doc principal (AUTHZ-001).
  customerCoords?: Coords;
  deliveryDistanceM?: number | null;
  deliveryDistanceSource?: 'route' | 'line' | null;
  deliveryDurationS?: number | null;
  deliveryZone?: string | null;
}

/** Texto amigable para direcciones de tienda legacy que en realidad son coordenadas. */
export function cleanStoreAddress(raw: string | undefined) {
  if (!raw) return 'Dirección de la tienda';
  if (raw.includes('Ubicación GPS') || raw.includes('lat:') || raw.includes('(-28.')) return 'Ver ubicación en el mapa';
  return raw;
}

/**
 * Tarjeta de un pedido para TOMAR (rediseño en vidrio, 9/11/2026). La usan el dashboard
 * `/delivery` ("Para tomar") y la pestaña Disponibles de `/orders`, para que se vean y se
 * comporten igual. La acción de tomar NO vive acá: llega por `onTake` desde
 * `useDriverTakeOrder` (hooks/driver-take-order.ts), la única lógica de tomar.
 *
 * Privacidad (Fase UU / AUTHZ-001): muestra la dirección de la TIENDA y, del cliente, solo la
 * zona + km por ruta + minutos. La dirección exacta aparece recién al tomar el pedido.
 */
export function DriverJobCard({
  order, onTake, takeLabel, takeDisabled, taking, onDetail, leaving, index = 0,
}: {
  order: DriverPoolOrder;
  onTake: () => void;
  takeLabel: string;
  takeDisabled: boolean;
  taking: boolean;
  onDetail?: () => void;
  /** La tarjeta se va (pedido recién tomado): sale deslizándose. */
  leaving?: boolean;
  index?: number;
}) {
  // Pedidos legacy sin distancia guardada: recta con las coords embebidas.
  const distM = typeof order.deliveryDistanceM === 'number'
    ? order.deliveryDistanceM
    : (isValidCoords(order.storeCoords) && isValidCoords(order.customerCoords)
        ? distanceMeters(order.storeCoords!, order.customerCoords!) : null);
  const ready = order.status === 'Listo para recoger';

  return (
    <article
      data-testid="driver-job"
      data-order-id={order.id}
      style={{ animationDelay: leaving ? undefined : `${Math.min(index, 6) * 60}ms` }}
      className={cn(
        'glass-strong rounded-card p-4 sm:p-5',
        leaving
          ? 'pointer-events-none animate-out fade-out-0 slide-out-to-right-8 fill-mode-forwards duration-300 motion-reduce:animate-none motion-reduce:opacity-0'
          : 'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-500 motion-reduce:animate-none',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-headline text-2xl font-extrabold leading-tight">{order.storeName || 'Tienda'}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {ready ? 'Ya está listo para retirar' : 'La tienda lo está preparando'}
          </p>
        </div>
        <Pill tone="money" className="shrink-0 text-xl" >+{money(driverNetForOrder(order))}</Pill>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-start gap-3">
          <StoreIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Retirar en</p>
            <p className="break-words font-semibold">{cleanStoreAddress(order.storeAddress)}</p>
          </div>
        </div>
        <DeliveryTripInfo
          size="lg"
          zone={order.deliveryZone}
          distanceM={distM}
          durationS={order.deliveryDurationS}
          source={order.deliveryDistanceSource ?? (distM != null ? 'line' : null)}
        />
      </div>

      <div className="mt-4 grid gap-2">
        <Button
          className="h-14 w-full rounded-2xl font-headline text-xl font-extrabold"
          onClick={onTake}
          disabled={takeDisabled}
          aria-busy={taking || undefined}
          data-testid="take-order"
        >
          {takeLabel}
        </Button>
        {/* Ver qué lleva el pedido ANTES de tomarlo (pedido de la prueba, 15/8). */}
        {onDetail && (
          <Button variant="ghost" className="h-11 w-full rounded-2xl text-base" onClick={onDetail}>
            <Eye className="h-4 w-4" aria-hidden="true" /> Ver detalle del pedido
          </Button>
        )}
      </div>
    </article>
  );
}

/** Aviso de "cuenta pendiente de aprobación" (no es una suspensión: ver SuspensionNotice). */
export function DriverPendingNotice({ className, detailed = false }: { className?: string; detailed?: boolean }) {
  return (
    <div className={cn('glass-strong flex items-start gap-3 rounded-card border-warning/50 p-4', className)} role="status" data-testid="driver-pending-notice">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
        <Clock className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">Tu cuenta está pendiente de aprobación</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {detailed
            ? 'Un administrador tiene que revisar y aprobar tus datos (vehículo y documentos) antes de que puedas tomar pedidos. Asegurate de haber subido todas las fotos que pide tu perfil.'
            : 'Un administrador tiene que revisar tus datos antes de que puedas tomar pedidos.'}
        </p>
      </div>
    </div>
  );
}
