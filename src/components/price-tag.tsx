import { cn } from '@/lib/utils';
import { money } from '@/lib/format-money';

/**
 * Etiqueta de precio con punta y agujerito (Rediseño 2, dirección "Toldo"): el precio
 * como en la góndola del almacén. `offer` la pinta del naranja de ofertas (con su color de
 * texto, legible en los dos temas). El tamaño sale del `font-size` de `className`.
 */
export function PriceTag({ value, offer = false, className }: { value: number; offer?: boolean; className?: string }) {
  return <span className={cn('price-tag', offer && 'price-tag-offer', className)}>{money(value)}</span>;
}

/** Etiqueta con un texto libre (por ejemplo "−20%"), mismo dibujo que el precio. */
export function TextTag({ children, offer = false, className }: { children: React.ReactNode; offer?: boolean; className?: string }) {
  return <span className={cn('price-tag', offer && 'price-tag-offer', className)}>{children}</span>;
}
