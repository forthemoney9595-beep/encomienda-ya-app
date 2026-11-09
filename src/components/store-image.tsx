'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/category-style';
import { Awning } from '@/components/awning';

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
  /** Banner grande: la fachada muestra el nombre de la tienda como un cartel. */
  withName?: boolean;
}

/**
 * Imagen de una tienda con fallback de FACHADA (Rediseño 2, dirección "Toldo").
 *
 * Muchas tiendas no tienen banner cargado. Antes eso dejaba un rectángulo gris (y después
 * un degradé con iniciales, que era una de las señas de "hecho con IA"). Ahora, sin foto
 * (o si la que hay no carga), se dibuja una fachada: el toldo a rayas del color del rubro
 * arriba y el dibujo del rubro abajo; en el banner grande, el nombre como un cartel. Cada
 * tienda se ve como un negocio con la persiana abierta aunque nunca suba una imagen.
 *
 * El `onError` además hace segura la migración a `next/image`: si la URL viene de un host
 * que no está en `remotePatterns` (next.config.js), el optimizador responde 400 y en vez
 * de una imagen rota se ve la fachada.
 *
 * El contenedor padre define la forma (aspect-ratio / alto); acá todo es `absolute inset-0`.
 */
export function StoreImage({
  src, alt, name, category, grayscale, sizes, priority, className, initialsClassName, withName,
}: StoreImageProps) {
  const [errored, setErrored] = useState(false);
  const style = getCategoryStyle(category || '');
  const Icon = style.icon;
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
        <div className="absolute inset-0 flex flex-col" role="img" aria-label={name ? `Fachada de ${name}` : 'Tienda sin foto'}>
          <Awning category={category} className={withName ? 'h-[38%] min-h-[28px] shrink-0' : 'h-[34%] min-h-[16px] shrink-0'} />
          <div className="flex flex-1 items-center justify-center gap-3 px-3 pt-2">
            <Icon className={cn(withName ? 'h-10 w-10' : 'h-[42%] w-[42%] max-h-14 max-w-14', style.text)} aria-hidden="true" />
            {withName && name && (
              <span className={cn('font-headline font-extrabold leading-none tracking-tight text-foreground line-clamp-1', initialsClassName || 'text-3xl')}>
                {name}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
