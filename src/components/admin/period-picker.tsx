'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface PeriodOption<V extends string> { value: V; label: string }

/**
 * Selector de período del admin (spec §c): pestañas compactas, targets ≥ 36 px, mismo look en
 * Resumen financiero / Ganancias / analíticas. Genérico en el tipo del valor para que cada
 * pantalla declare sus períodos (7d/30d/mes/mes anterior/año…).
 */
export function PeriodPicker<V extends string>({ value, onChange, options, className, ariaLabel = 'Período' }: {
  value: V; onChange: (v: V) => void; options: PeriodOption<V>[]; className?: string; ariaLabel?: string;
}) {
  return (
    // flex-wrap (no scroll horizontal): un scroll container aporta su ancho máximo como mínimo a
    // la barra de acciones y a 430 px desbordaba la página (medido: 529 px). Envuelto, el mínimo
    // es el ancho de UNA pestaña y las filas crecen con h-auto.
    <Tabs value={value} onValueChange={(v) => onChange(v as V)} className={cn('min-w-0 max-w-full', className)}>
      <TabsList className="h-auto min-h-9 flex-wrap gap-y-1" aria-label={ariaLabel} data-testid="period-picker">
        {options.map(o => (
          <TabsTrigger key={o.value} value={o.value} className="h-9 px-3 text-[13px]" data-period={o.value}>{o.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
