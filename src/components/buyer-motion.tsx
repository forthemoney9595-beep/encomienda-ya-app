'use client';

// Piezas de movimiento y vidrio de la tanda COMPRADOR (rediseño en vidrio, 9/11/2026).
// Archivo propio de la tanda: la base (globals.css, ui/*) es de otro dueño. Sin librerías
// nuevas: CSS Module + React. Todo respeta prefers-reduced-motion (ver el .module.css).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import motion from './buyer-motion.module.css';

export const buyerMotion = motion;

// useLayoutEffect avisa en el servidor; en el cliente mide antes de pintar (sin salto).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Píldora que se desliza hasta el elemento activo de una fila de solapas o chips.
 * El contenedor tiene que ser `relative`; la píldora se pinta DETRÁS del contenido
 * (los hijos llevan `relative z-[1]`) o encima si `overlay` (anillo, sin tapar el texto).
 * `activeSelector` es un selector CSS relativo al contenedor (ej. `[data-state="active"]`).
 * `activeKey` dispara la nueva medición cuando cambia la selección.
 */
export function SlidingPill({
  containerRef,
  activeSelector,
  activeKey,
  className,
  inset = 0,
}: {
  containerRef: RefObject<HTMLElement | null>;
  activeSelector: string;
  activeKey: unknown;
  className?: string;
  /** Achica la píldora N px por lado (para que respire dentro de la solapa). */
  inset?: number;
}) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Sin transición en la primera medición: si no, la píldora "vuela" desde la esquina.
  const [animate, setAnimate] = useState(false);

  const measure = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(activeSelector);
    if (!el) { setBox(null); return; }
    setBox({ x: el.offsetLeft + inset, y: el.offsetTop + inset, w: el.offsetWidth - inset * 2, h: el.offsetHeight - inset * 2 });
  }, [containerRef, activeSelector, inset]);

  useIsoLayoutEffect(() => {
    measure();
    // Segunda medición al cuadro siguiente: algunas librerías (Radix) terminan de marcar el
    // elemento activo después del commit, y la primera lectura queda con el anterior.
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure, activeKey]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    Array.from(root.children).forEach(c => ro.observe(c));
    // Las letras de Sofia Sans cambian el ancho de las solapas al terminar de cargar.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [containerRef, measure]);

  useEffect(() => {
    if (!box || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [box, animate]);

  if (!box) return null;
  return (
    <span
      aria-hidden="true"
      data-sliding-pill=""
      data-pill-key={String(activeKey)}
      className={cn('pointer-events-none absolute left-0 top-0', animate && motion.pill, className)}
      style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
    />
  );
}

/** Devuelve una clave que cambia cada vez que `value` SUBE: sirve para re-montar un nodo
 *  con la clase `bump` y que el latido se repita en cada agregado (no al quitar). */
export function useBumpKey(value: number): number {
  const prev = useRef(value);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (value > prev.current) setKey(k => k + 1);
    prev.current = value;
  }, [value]);
  return key;
}

/** Lleva el chip activo de una fila con scroll horizontal a la vista, sin mover la página. */
export function useScrollActiveIntoRow(rowRef: RefObject<HTMLElement | null>, activeSelector: string, activeKey: unknown) {
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const el = row.querySelector<HTMLElement>(activeSelector);
    if (!el) return;
    const left = el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
  }, [rowRef, activeSelector, activeKey]);
}

/**
 * Agranda la X de cierre de los diálogos de shadcn (16 px en `ui/dialog.tsx`, que es de otro
 * dueño) a un círculo tocable de 44 px. Se pasa en el `className` del DialogContent: apunta
 * al último botón hijo directo, que es siempre el Close de Radix.
 */
export const DIALOG_CLOSE_BIG =
  '[&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:grid [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-foreground/[0.06] [&>button:last-child]:opacity-90';

/** Bloque de skeleton en vidrio (para cargas): tinta muy suave + brillo que recorre. */
export function GlassBone({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn(motion.shine, 'rounded-xl bg-foreground/[0.07]', className)} />;
}

/** Cáscara de diálogo de la tanda comprador: con margen en celular (no pegado a los bordes)
 *  y radio de tarjeta en todos los tamaños (shadcn solo redondea desde sm). */
export const DIALOG_SHELL = 'w-[calc(100%-1.5rem)] rounded-card sm:rounded-card';
