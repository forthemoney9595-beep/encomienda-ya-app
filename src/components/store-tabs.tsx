'use client';

import * as React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * Pestañas del panel de la tienda con indicador que SE DESLIZA (rediseño en vidrio,
 * 9/11/2026). Envuelve los TabsList/TabsTrigger de shadcn (Radix): funciona con Tabs
 * controladas o no, sin cambiar la lógica de quien las usa.
 *
 * El indicador es una píldora de vidrio fuerte detrás de la pestaña activa: se mide la
 * pestaña con `data-state="active"` (MutationObserver sobre el atributo + ResizeObserver
 * para cambios de ancho) y se mueve con transform. Con "reducir movimiento" la transición
 * global de globals.css la deja instantánea.
 */
export const StoreTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  React.ComponentPropsWithoutRef<typeof TabsList>
>(({ className, children, ...props }, forwardedRef) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<{ x: number; w: number; ready: boolean }>({ x: 0, w: 0, ready: false });

  const setRefs = (el: HTMLDivElement | null) => {
    listRef.current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active) return;
      setBox({ x: active.offsetLeft, w: active.offsetWidth, ready: true });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    list.querySelectorAll('[role="tab"]').forEach(t => ro.observe(t));
    return () => { mo.disconnect(); ro.disconnect(); };
  }, []);

  return (
    <TabsList
      ref={setRefs}
      className={cn(
        // bg-[var(--glass)]: pisa el bg-muted de shadcn (una utilidad gana sobre .glass).
        'glass relative h-auto w-full gap-1 rounded-full bg-[var(--glass)] p-1.5 text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        data-tab-indicator=""
        className={cn(
          'pointer-events-none absolute bottom-1.5 left-0 top-1.5 rounded-full bg-primary shadow-glow-sm transition-[transform,width,opacity] duration-300 ease-spring',
          box.ready ? 'opacity-100' : 'opacity-0',
        )}
        style={{ width: box.w, transform: `translateX(${box.x}px)` }}
      />
      {children}
    </TabsList>
  );
});
StoreTabsList.displayName = 'StoreTabsList';

export const StoreTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsTrigger>,
  React.ComponentPropsWithoutRef<typeof TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      // Encima del indicador; la pestaña activa no pinta fondo propio (lo pone la píldora).
      'relative z-[1] min-h-11 flex-1 rounded-full px-3 text-base font-semibold transition-colors',
      'data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none',
      'hover:text-foreground data-[state=active]:hover:text-primary-foreground',
      className,
    )}
    {...props}
  />
));
StoreTabsTrigger.displayName = 'StoreTabsTrigger';
