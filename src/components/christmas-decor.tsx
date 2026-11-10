'use client';

// Decoración de Navidad ilustrada (10/11/2026, a pedido de David): gorro de Papá Noel para el
// logo, moño rojo para las esquinas y un Papá Noel que se asoma en la cabecera del inicio.
// Acompaña a la guirnalda y la estrellita de `garland.tsx`, con los mismos colores (rojo
// navidad, blanco, dorado, verde) y las mismas reglas:
// - Todo sale SOLO con `useChristmas().active` (8/12 al 6/1, o lo que diga Ajustes). Fuera de
//   temporada no se renderiza nada y `FestiveHeader` devuelve el mismo <div> de siempre: cero
//   cambio de layout.
// - Decorativo: `aria-hidden` + `pointer-events: none`; nunca tapa un toque.
// - Animaciones solo CSS (transform/opacity, baratas en Android de gama baja) y quietas con
//   "reducir movimiento" (globals.css). Sin nieve ni partículas: acá es verano.
// - Los blancos llevan un contorno suave para leerse también sobre el vidrio claro.

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useChristmas } from '@/hooks/use-christmas';
import { Garland } from '@/components/garland';

const RED = '#D93A2B';
const RED_DARK = '#A8241A';
const WHITE = '#FFFFFF';
const LINE = 'rgba(70, 40, 30, 0.28)';
const SKIN = '#F4C7A5';
const CHEEK = '#EE9C8E';
const NOSE = '#E07A68';
const INK = '#3B2A24';

/**
 * El gorro dibujado en el sistema de coordenadas del logo (viewBox 0 0 100 100, cabeza en
 * (50,15) r10). Lo usa `Logo` adentro de su propio <svg> con `overflow: visible`: el gorro
 * sobresale unos px arriba sin cambiar el tamaño de la caja del ícono.
 */
export function SantaHatGlyph() {
  return (
    <g data-santa-hat="" transform="rotate(-12 50 12)">
      {/* copa: sube y se cae hacia la derecha */}
      <path d="M36 12 C 37 -5 49 -16 65 -13 C 73 -11 79 -5 81 2 C 74 -3 67 -3 63 1 C 64 5 64 9 64 12 Z" fill={RED} />
      <path d="M52 -12 C 60 -15 70 -12 76 -6 C 70 -8 63 -8 58 -5 Z" fill={RED_DARK} opacity="0.55" />
      {/* borde de piel */}
      <rect x="32" y="7" width="36" height="11" rx="5.5" fill={WHITE} stroke={LINE} strokeWidth="2" />
      {/* pompón */}
      <circle cx="81" cy="4" r="6.5" fill={WHITE} stroke={LINE} strokeWidth="2" />
    </g>
  );
}

/**
 * Gorro suelto, para apoyar sobre cualquier ícono: el padre tiene que ser `relative`.
 * Fuera de temporada, `null`.
 */
export function SantaHat({ className, forceActive }: { className?: string; forceActive?: boolean }) {
  const { active } = useChristmas();
  if (!(forceActive ?? active)) return null;
  return (
    <svg
      viewBox="28 -20 64 42"
      aria-hidden="true"
      className={cn('pointer-events-none absolute h-auto w-6 overflow-visible', className)}
    >
      <SantaHatGlyph />
    </svg>
  );
}

/** Moño rojo con cintas. `sm` ≈ 28 px de ancho, `md` ≈ 40 px. Fuera de temporada, `null`. */
export function ChristmasBow({
  size = 'sm',
  className,
  forceActive,
}: {
  size?: 'sm' | 'md';
  className?: string;
  forceActive?: boolean;
}) {
  const { active } = useChristmas();
  if (!(forceActive ?? active)) return null;
  return (
    <svg
      viewBox="0 0 48 42"
      aria-hidden="true"
      data-xmas-bow=""
      className={cn(
        'xmas-bow pointer-events-none absolute z-[3]',
        size === 'md' ? 'h-[35px] w-10' : 'h-[25px] w-7',
        className,
      )}
    >
      {/* cintas */}
      <path d="M21.5 18 L 11 37 L 16.5 35 L 18.5 40.5 L 26 19 Z" fill={RED_DARK} />
      <path d="M26.5 18 L 37 37 L 31.5 35 L 29.5 40.5 L 22 19 Z" fill={RED} />
      {/* lazos */}
      <path d="M24 16 C 16 3 3 2 3 11.5 C 3 21 16 22 24 16 Z" fill={RED} />
      <path d="M24 16 C 32 3 45 2 45 11.5 C 45 21 32 22 24 16 Z" fill={RED} />
      <path d="M24 16 C 18 10 10 9 9 12 C 9 15.5 17 18 24 16 Z" fill={RED_DARK} opacity="0.7" />
      <path d="M24 16 C 30 10 38 9 39 12 C 39 15.5 31 18 24 16 Z" fill={RED_DARK} opacity="0.7" />
      {/* brillo */}
      <path d="M8 8.5 C 10 6 14 5.5 17 7" fill="none" stroke={WHITE} strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
      {/* nudo */}
      <rect x="19.5" y="11" width="9" height="10" rx="3.5" fill={RED_DARK} />
      <rect x="21" y="12.5" width="3" height="4" rx="1.5" fill={WHITE} opacity="0.35" />
    </svg>
  );
}

/**
 * Papá Noel asomándose desde el borde de ABAJO de una tarjeta (el dibujo termina en los
 * hombros, cortado al ras). Va dentro de una capa `absolute inset-0 overflow-hidden` para que
 * al aparecer suba "desde atrás" del borde; saluda con la mano cada tanto.
 */
function SantaPeekArt() {
  return (
    <svg viewBox="0 0 96 88" className="block h-full w-full overflow-visible">
      {/* hombros */}
      <path d="M12 88 C 14 71 30 64 48 64 C 66 64 82 71 84 88 Z" fill={RED} />
      <path d="M40 66 L 48 88 L 56 66 Z" fill={RED_DARK} opacity="0.35" />
      {/* barba */}
      <path
        d="M24 42 C 20 52 23 63 30 70 C 34 76 41 81 48 82 C 55 81 62 76 66 70 C 73 63 76 52 72 42 Z"
        fill={WHITE}
        stroke={LINE}
        strokeWidth="1.4"
      />
      {/* cara */}
      <ellipse cx="48" cy="42" rx="16" ry="15" fill={SKIN} />
      <circle cx="38" cy="46" r="3.6" fill={CHEEK} opacity="0.7" />
      <circle cx="58" cy="46" r="3.6" fill={CHEEK} opacity="0.7" />
      {/* ojos contentos */}
      <path d="M38.5 41 Q 41.5 37.5 44.5 41" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M51.5 41 Q 54.5 37.5 57.5 41" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      {/* bigote + nariz */}
      <path
        d="M48 50 C 43 46.5 35 47.5 32.5 53 C 38 56.5 44 55.5 48 52 C 52 55.5 58 56.5 63.5 53 C 61 47.5 53 46.5 48 50 Z"
        fill={WHITE}
        stroke={LINE}
        strokeWidth="1.4"
      />
      <path d="M44.5 57 Q 48 59.5 51.5 57" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="48" cy="47" r="4.4" fill={NOSE} />
      <circle cx="46.6" cy="45.6" r="1.3" fill={WHITE} opacity="0.6" />
      {/* gorro */}
      <path d="M30 29 C 33 11 47 3 62 5 C 72 6.5 80 13 83 21 C 76 17 70 17 66 21 C 67 24 67 27 66 29 Z" fill={RED} />
      <path d="M50 6 C 60 4 70 7 77 13 C 70 11 62 11 56 14 Z" fill={RED_DARK} opacity="0.5" />
      <rect x="27" y="25" width="42" height="11" rx="5.5" fill={WHITE} stroke={LINE} strokeWidth="1.4" />
      <circle cx="84" cy="22.5" r="6.5" fill={WHITE} stroke={LINE} strokeWidth="1.4" />
      {/* brazo que saluda */}
      <g className="santa-arm">
        <path d="M15 88 C 12 78 9 68 9 60 L 19 58 C 20 66 22 76 25 86 Z" fill={RED} />
        <rect x="6" y="54" width="16" height="7" rx="3.5" fill={WHITE} stroke={LINE} strokeWidth="1.2" />
        <path d="M8 55 C 5 48 7 40 13 39 C 18 38.5 21 43 21 48 C 21 51 20.5 53.5 20 55 Z" fill={WHITE} stroke={LINE} strokeWidth="1.2" />
        <path d="M19.5 49 C 23 46.5 26 48 25 51 C 24 53 21.5 54 20 54" fill={WHITE} stroke={LINE} strokeWidth="1.2" />
      </g>
    </svg>
  );
}

export function SantaPeek({ className, forceActive }: { className?: string; forceActive?: boolean }) {
  const { active } = useChristmas();
  if (!(forceActive ?? active)) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[inherit]">
      <div data-santa-peek="" className={cn('santa-peek absolute bottom-0', className)}>
        <SantaPeekArt />
      </div>
    </div>
  );
}

/**
 * Cabecera del inicio con la decoración. Fuera de temporada devuelve EXACTAMENTE
 * `<div className={className}>` (el layout no cambia ni un px). En temporada la cabecera pasa
 * a ser una tarjeta de vidrio con la guirnalda colgando del borde, dos moños en las esquinas
 * de arriba y Papá Noel asomándose abajo a la derecha (con su lugar reservado a la derecha
 * del contenido, así nunca tapa el titular ni los botones).
 */
export function FestiveHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const { active } = useChristmas();
  if (!active) return <div className={className}>{children}</div>;
  return (
    <div
      data-festive-header=""
      className={cn(
        className,
        'glass relative mt-3 rounded-card px-4 pb-4 pt-7 pr-[66px] sm:px-6 sm:pb-6 sm:pt-8 sm:pr-[140px]',
      )}
    >
      <Garland />
      <ChristmasBow size="sm" className="-left-2 -top-2.5 -rotate-12 sm:hidden" />
      <ChristmasBow size="sm" className="-right-2 -top-2.5 rotate-12 sm:hidden" />
      <ChristmasBow size="md" className="-left-3 -top-3.5 -rotate-12 hidden sm:block" />
      <ChristmasBow size="md" className="-right-3 -top-3.5 rotate-12 hidden sm:block" />
      <SantaPeek className="right-1.5 h-[53px] w-[58px] sm:right-6 sm:h-[101px] sm:w-[110px]" />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
