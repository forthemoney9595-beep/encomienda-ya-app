import { cn } from '@/lib/utils';
import { money } from '@/lib/format-money';

/**
 * Píldora redondeada para precios y porcentajes (rediseño en vidrio, 9/11/2026; reemplaza a
 * la etiqueta con agujerito del Toldo, `price-tag.tsx`, que se borró).
 *
 * Tonos:
 * - 'neutral' (default): fondo de tinta muy suave, texto de tinta. Precio común.
 * - 'offer': naranja de OFERTAS con texto OSCURO (`bg-offer text-offer-foreground`, se lee
 *   en los dos temas). Precio con descuento o "−20%". Verde NUNCA para descuentos.
 * - 'money': verde de plata (lo que gana la tienda o el repartidor), texto verde sobre su
 *   panel suave.
 * El tamaño sale del `font-size` de `className` (`text-base`, `text-2xl`…).
 */
export type PillTone = 'neutral' | 'offer' | 'money';

const TONES: Record<PillTone, string> = {
  neutral: 'bg-foreground/[0.07] text-foreground',
  offer: 'bg-offer text-offer-foreground',
  money: 'bg-success/15 text-success',
};

export function Pill({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: PillTone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[0.6em] py-[0.12em] font-headline font-extrabold leading-tight tabular-nums',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Precio con `money()` ("$2.800") en píldora. `offer` = naranja de ofertas. */
export function PricePill({ value, offer = false, tone, className }: { value: number; offer?: boolean; tone?: PillTone; className?: string }) {
  return <Pill tone={tone ?? (offer ? 'offer' : 'neutral')} className={className}>{money(value)}</Pill>;
}
