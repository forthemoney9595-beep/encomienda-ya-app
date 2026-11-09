import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/category-style';

// Tamaños en rem (crecen con el texto base de 18 px de la app; en el admin, 16 px).
// sm ≈ 40 px (filas, listas), md ≈ 56 px (tarjetas, encabezado de tienda), lg ≈ 72 px
// (tienda sin foto, estado vacío). Clases literales a propósito (JIT de Tailwind).
const SIZES = {
  sm: { box: 'h-[2.25rem] w-[2.25rem] rounded-[0.75rem]', icon: 'h-[1.1rem] w-[1.1rem]' },
  md: { box: 'h-[3.125rem] w-[3.125rem] rounded-[1rem]', icon: 'h-[1.55rem] w-[1.55rem]' },
  lg: { box: 'h-[4rem] w-[4rem] rounded-[1.25rem]', icon: 'h-[2rem] w-[2rem]' },
} as const;

export type CategoryTileSize = keyof typeof SIZES;

/**
 * Ícono del RUBRO en un cuadradito de color sólido (rediseño en vidrio, 9/11/2026; reemplaza
 * al toldo a rayas). Familia por rubro: comida naranja, almacén dorado, salud verde agua,
 * ropa/hogar azul; 'todas' = petróleo de marca.
 *
 * El relleno es el tono PROFUNDO de la familia en los DOS temas, con el ícono blanco
 * (clases `.cat-tile` + `.tile-*` de globals.css): así se reconoce igual de día y de noche.
 * Decorativo por defecto (`aria-hidden`); con `label` pasa a `role="img"` con ese nombre.
 */
export function CategoryTile({
  category, size = 'md', label, className,
}: {
  /** Rubro tal cual está guardado (`stores/{id}.category`) o 'todas' para la marca. */
  category?: string;
  size?: CategoryTileSize;
  /** Texto para lectores de pantalla. Sin él, el cuadradito es decorativo. */
  label?: string;
  className?: string;
}) {
  const style = getCategoryStyle(category || '');
  const Icon = style.icon;
  const s = SIZES[size];
  return (
    <span
      className={cn('cat-tile grid shrink-0 place-items-center', style.tile, s.box, className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-category-tile={size}
    >
      <Icon className={s.icon} strokeWidth={2.1} aria-hidden="true" />
    </span>
  );
}
