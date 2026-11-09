'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useChristmas } from '@/hooks/use-christmas';

// Rojo, dorado, verde, dorado: se repite a lo largo del cable.
const BULB_COLORS = ['#D93A2B', '#E9B23C', '#2E9D5B', '#E9B23C'];
const STEP_PX = 42; // una lucecita cada ~42 px

/**
 * Guirnalda de lucecitas de Navidad (rediseño en vidrio, 9/11/2026).
 *
 * Se pone ADENTRO de una tarjeta con `position: relative` (p. ej. un `<Card className="relative">`)
 * y cuelga del borde de arriba: `absolute left-3.5 right-3.5 -top-1.5`. Ojo con las tarjetas
 * con `overflow-hidden`: recortan los 6 px que sobresalen (pasale `className="top-1"` ahí).
 *
 * - Devuelve `null` fuera de temporada (`useChristmas`: 8/12 al 6/1 o lo que diga Ajustes).
 * - El cable se redibuja según el ancho real de la tarjeta (ResizeObserver), así no se
 *   estiran las lucecitas en una tarjeta ancha ni se amontonan en una angosta.
 * - Titilan con demoras escalonadas; con "reducir movimiento" quedan quietas (globals.css).
 * - Es decorativa: `aria-hidden` y `pointer-events: none` (nunca tapa un toque).
 */
export function Garland({ className, forceActive }: { className?: string; forceActive?: boolean }) {
  const { active } = useChristmas();
  const on = forceActive ?? active;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!on || !ref.current) return;
    const el = ref.current;
    const measure = () => setWidth(Math.round(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  if (!on) return null;

  const n = width > 0 ? Math.max(3, Math.round(width / STEP_PX)) : 0;
  const s = n ? width / n : 0;
  let d = 'M0 2';
  for (let k = 0; k < n; k++) d += ` Q${((k + 0.5) * s).toFixed(1)} 14 ${((k + 1) * s).toFixed(1)} 2`;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-garland=""
      className={cn('garland pointer-events-none absolute -top-1.5 left-3.5 right-3.5 z-[2] h-5', className)}
    >
      {n > 0 && (
        <>
          <svg viewBox={`0 0 ${width} 20`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <path d={d} className="garland-cable" />
          </svg>
          {Array.from({ length: n }, (_, k) => (
            <i
              key={k}
              className="garland-bulb"
              style={{
                left: `${((k + 0.5) * s).toFixed(1)}px`,
                ['--c' as string]: BULB_COLORS[k % BULB_COLORS.length],
                ['--d' as string]: `${((k * 0.37) % 2.6).toFixed(2)}s`,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Estrellita dorada de temporada, para ir al lado del logo o del título del encabezado.
 * `null` fuera de temporada. Decorativa (`aria-hidden`). Gira apenas; quieta con
 * "reducir movimiento".
 */
export function SeasonStar({ className, forceActive }: { className?: string; forceActive?: boolean }) {
  const { active } = useChristmas();
  if (!(forceActive ?? active)) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-season-star="" className={cn('season-star h-[18px] w-[18px] shrink-0', className)}>
      <path d="m12 2 2.9 6.6 7.1.7-5.4 4.8 1.6 7L12 17.5 5.8 21.1l1.6-7L2 9.3l7.1-.7Z" />
    </svg>
  );
}
