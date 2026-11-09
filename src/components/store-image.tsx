'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/category-style';
import { CategoryTile, type CategoryTileSize } from '@/components/category-tile';

interface StoreImageProps {
  src?: string;
  alt?: string;
  /** Nombre de la tienda — se muestra como cartel si `withName`, y nombra la imagen. */
  name?: string;
  /** Rubro (`stores/{id}.category`) — define el color del tinte y el ícono. */
  category?: string;
  /** Se conserva por compatibilidad (antes variaba el degradé); hoy no cambia nada. */
  seed?: string;
  /** Tienda cerrada/pausada: apaga el color. */
  grayscale?: boolean;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Tamaño de letra del nombre cuando `withName` (p. ej. "text-4xl"). */
  initialsClassName?: string;
  /** Banner grande: al lado del cuadradito del rubro va el nombre de la tienda. */
  withName?: boolean;
  /** Tamaño del cuadradito del rubro sin foto. Default: 'md' (o 'lg' con `withName`). */
  tileSize?: CategoryTileSize;
}

/**
 * Imagen de una tienda con fallback del RUBRO (rediseño en vidrio, 9/11/2026).
 *
 * Muchas tiendas no tienen banner cargado. Sin foto (o si la que hay no carga) se pinta una
 * superficie con un tinte suave del color del rubro y, al centro, el cuadradito del rubro
 * (`CategoryTile`); en el banner grande (`withName`), además el nombre como cartel. Antes era
 * la fachada con toldo a rayas, que se sacó del diseño.
 *
 * El `onError` además hace segura la migración a `next/image`: si la URL viene de un host
 * que no está en `remotePatterns` (next.config.js), el optimizador responde 400 y en vez
 * de una imagen rota se ve el rubro.
 *
 * El contenedor padre define la forma (aspect-ratio / alto / radio); acá todo es `absolute inset-0`.
 */
export function StoreImage({
  src, alt, name, category, grayscale, sizes, priority, className, initialsClassName, withName, tileSize,
}: StoreImageProps) {
  const [errored, setErrored] = useState(false);
  const style = getCategoryStyle(category || '');
  const showImage = !!src && !errored;

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-card', grayscale && 'grayscale', className)}>
      {showImage ? (
        <Image
          src={src!}
          alt={alt || name || 'Tienda'}
          fill
          sizes={sizes || '(max-width: 640px) 40vw, 320px'}
          priority={priority}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div
          className={cn('absolute inset-0 flex items-center justify-center gap-3 px-4', style.bg)}
          role="img"
          aria-label={name ? `${name}, sin foto` : 'Tienda sin foto'}
        >
          {/* Brillo suave arriba a la izquierda: que el tinte no se vea como un bloque plano. */}
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(255_255_255/0.45),transparent_60%)] dark:bg-[radial-gradient(120%_80%_at_0%_0%,rgb(255_255_255/0.08),transparent_60%)]" aria-hidden="true" />
          <CategoryTile category={category} size={tileSize ?? (withName ? 'lg' : 'md')} className="relative" />
          {withName && name && (
            <span className={cn('relative min-w-0 font-headline font-extrabold leading-none tracking-tight text-foreground line-clamp-2', initialsClassName || 'text-3xl')}>
              {name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
