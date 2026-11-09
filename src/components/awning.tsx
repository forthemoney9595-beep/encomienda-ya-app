import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/category-style';

/**
 * Toldo a rayas del color del rubro, con festón abajo (Rediseño 2, dirección "Toldo").
 * Es la pieza que hace que cada tienda se reconozca aunque no tenga foto: un negocio con la
 * persiana abierta. El alto lo define quien lo usa (`className`, p. ej. "h-6").
 * Las clases de color son literales (`awn-food`, …) y viven en globals.css.
 */
export function Awning({ category, className }: { category?: string; className?: string }) {
  const { awning } = getCategoryStyle(category || '');
  return <div aria-hidden="true" className={cn('awn', awning, className)} />;
}
