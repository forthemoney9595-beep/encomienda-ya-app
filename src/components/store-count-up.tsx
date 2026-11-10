'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Número que sube animado hasta `value` (rediseño en vidrio: tablero de /my-store).
 * Solo anima el CAMBIO: la primera vez cuenta desde 0, después desde el valor anterior.
 * Con "reducir movimiento" muestra el valor final directo. `format` arma el texto
 * (p. ej. `money` para plata); el número real nunca se redondea por la animación al final.
 * `null` = todavía no hay dato → "…" (nunca un 0 falso).
 */
export function StoreCountUp({
  value,
  format = (n: number) => String(Math.round(n)),
  durationMs = 700,
  className,
}: {
  value: number | null;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState<number | null>(value === null ? null : 0);
  const fromRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    if (reduce || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
      else { fromRef.current = value; setShown(value); }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      // Si se corta a la mitad, la próxima animación arranca desde donde quedó.
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return (
    <span className={className} aria-busy={value === null || undefined}>
      {shown === null ? '…' : format(shown)}
    </span>
  );
}
