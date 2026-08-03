'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getCategoryGradient } from '@/lib/category-style';

interface StoreImageProps {
  src?: string;
  alt?: string;
  /** Nombre de la tienda — se usa para las iniciales del placeholder. */
  name?: string;
  /** Rubro (`stores/{id}.category`) — define el degradé y el ícono. */
  category?: string;
  /** Semilla para variar la dirección del degradé (usar el storeId). */
  seed?: string;
  /** Tienda cerrada/pausada: apaga el color. */
  grayscale?: boolean;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Tamaño de las iniciales; el default sirve para tarjetas. */
  initialsClassName?: string;
}

function getInitials(name?: string) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Imagen de una tienda con fallback de color.
 *
 * Muchas tiendas no tienen banner cargado, y antes eso dejaba un rectángulo gris con un
 * ícono: el inicio se veía como una pared de cajas vacías. Cuando no hay foto (o la que
 * hay no carga) se pinta un degradé propio del rubro + el ícono de la categoría + las
 * iniciales, así cada tienda tiene identidad visual aunque nunca suba una imagen.
 *
 * El `onError` además hace segura la migración a `next/image`: si la URL viene de un host
 * que no está en `remotePatterns` (next.config.js), el optimizador responde 400 y en vez
 * de una imagen rota se ve el degradé.
 *
 * El contenedor padre define la forma (aspect-ratio / alto); acá todo es `absolute inset-0`.
 */
export function StoreImage({
  src, alt, name, category, seed, grayscale, sizes, priority, className, initialsClassName,
}: StoreImageProps) {
  const [errored, setErrored] = useState(false);
  const { gradient, direction, icon: Icon } = getCategoryGradient(category || '', seed);
  const showImage = !!src && !errored;

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-muted', grayscale && 'grayscale', className)}>
      {showImage ? (
        <Image
          src={src!}
          alt={alt || name || 'Tienda'}
          fill
          sizes={sizes || '(max-width: 640px) 40vw, 320px'}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className={cn('absolute inset-0', direction, gradient)} aria-hidden>
          {/* Brillo diagonal, para que no sea un color plano */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-black/20" />
          {/* Marca de agua del rubro */}
          <Icon className="absolute -bottom-5 -right-4 h-28 w-28 -rotate-12 text-black/20" />
          {/* Iniciales de la tienda */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={cn(
                'font-headline font-extrabold tracking-tight text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]',
                initialsClassName || 'text-3xl',
              )}
            >
              {getInitials(name)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
