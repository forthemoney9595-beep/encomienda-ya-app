'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Pestañas y selector del repartidor con una PÍLDORA QUE SE DESLIZA hasta la opción activa
 * (rediseño en vidrio, 9/11/2026). Vidrio de fondo, píldora petróleo, texto claro encima.
 * La animación es solo `transform`/`width` (barata) y se apaga con "reducir movimiento".
 *
 * - `DriverTabsList`: va adentro de un `<Tabs>` de Radix (accesibilidad de pestañas
 *   completa: role="tab", flechas, foco). Los triggers se arman con `items`.
 * - `DriverSegmented`: lo mismo para un selector simple (botones con `aria-pressed`), p. ej.
 *   el período de las analíticas.
 */
type Item = { value: string; label: React.ReactNode; testId?: string };

function useSlider(value: string, deps: unknown) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const measure = useCallback(() => {
    const el = host.current?.querySelector<HTMLElement>(`[data-slide-value="${CSS.escape(value)}"]`);
    if (!el) return;
    setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);
  useLayoutEffect(() => {
    measure();
    const h = host.current;
    if (!h || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    return () => ro.disconnect();
  }, [measure, deps]);
  return { host, box };
}

function Slider({ box }: { box: { x: number; w: number } | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-1 left-0 top-1 rounded-full bg-primary shadow-glow-sm transition-[transform,width] duration-300 ease-spring motion-reduce:transition-none',
        !box && 'opacity-0',
      )}
      style={box ? { transform: `translateX(${box.x}px)`, width: box.w } : undefined}
    />
  );
}

const ITEM_BASE =
  'relative z-[1] inline-flex min-h-[2.75rem] items-center justify-center whitespace-nowrap rounded-full px-4 text-base font-semibold text-muted-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';

export function DriverTabsList({ items, value, className, fill = true }: { items: Item[]; value: string; className?: string; fill?: boolean }) {
  const labelsKey = items.map(i => (typeof i.label === 'string' ? i.label : i.value)).join('|');
  const { host, box } = useSlider(value, labelsKey);
  return (
    <TabsPrimitive.List
      ref={host}
      className={cn('glass relative flex rounded-full p-1', fill ? 'w-full' : 'inline-flex', className)}
    >
      <Slider box={box} />
      {items.map(it => (
        <TabsPrimitive.Trigger
          key={it.value}
          value={it.value}
          data-slide-value={it.value}
          data-testid={it.testId}
          className={cn(ITEM_BASE, fill && 'flex-1', 'data-[state=active]:text-primary-foreground')}
        >
          {it.label}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

export function DriverSegmented({ items, value, onChange, label, className }: {
  items: Item[]; value: string; onChange: (v: string) => void; label: string; className?: string;
}) {
  const { host, box } = useSlider(value, items.length);
  return (
    <div className={cn('max-w-full overflow-x-auto no-scrollbar', className)}>
      <div ref={host} role="group" aria-label={label} className="glass relative inline-flex rounded-full p-1">
        <Slider box={box} />
        {items.map(it => {
          const on = it.value === value;
          return (
            <button
              key={it.value}
              type="button"
              aria-pressed={on}
              data-slide-value={it.value}
              data-testid={it.testId}
              onClick={() => onChange(it.value)}
              className={cn(ITEM_BASE, on && 'text-primary-foreground')}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
