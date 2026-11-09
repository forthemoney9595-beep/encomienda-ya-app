'use client';

import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StoreImage } from '@/components/store-image';
import { getCategoryStyle, formatCategoryLabel } from '@/lib/category-style';

export interface StoreCardStore {
  id: string;
  name: string;
  category?: string;
  address?: string;
  imageUrl?: string;
  rating?: number;
  deliveryTime?: string;
  maxDiscountPercent?: number;
}

interface StoreCardProps {
  store: StoreCardStore;
  isFavorite: boolean;
  isOpen: boolean;
  statusLabel: string;
  /** Sin valor no se muestra la fila de envío (mejor omitirla que inventar un precio). */
  deliveryFee?: number;
  /** true = tarifa por distancia activa: se muestra "desde $X" (Fase RR ter). */
  deliveryFeeFrom?: boolean;
  onToggleFavorite: (e: React.MouseEvent, store: StoreCardStore) => void;
  /** Oculta el corazón donde no hay acción de favorito. */
  hideFavorite?: boolean;
  /** 'grid' = fila en celular / tarjeta en desktop. 'carousel' = tarjeta de ancho fijo. */
  variant?: 'grid' | 'carousel';
  /** Para la aparición escalonada. */
  index?: number;
  cleanAddress?: (address?: string) => string;
}

export function StoreCard({
  store, isFavorite, isOpen, statusLabel, deliveryFee, deliveryFeeFrom, onToggleFavorite,
  variant = 'grid', index = 0, cleanAddress, hideFavorite,
}: StoreCardProps) {
  const catStyle = getCategoryStyle(store.category || '');
  const isCarousel = variant === 'carousel';
  // La dirección salió de la tarjeta con el rediseño (19/8): vive en la tienda pública.
  // `cleanAddress`/`address` se mantienen en la interfaz para no romper llamadores.
  void cleanAddress;

  return (
    <Link
      href={`/stores/${store.id}`}
      className={cn('group block stagger-in', isCarousel && 'w-[260px] shrink-0')}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <Card
        className={cn(
          'relative flex h-full flex-col overflow-hidden border-transparent transition-colors',
          'hover:border-primary/30',
        )}
      >
        {/* Badge de descuento junto al nombre, rubro en el color de su FAMILIA + "Llega
            en...", y fila de detalles con el estado en texto. Rediseño 2 (Tanda 0): sin el
            botón "Ver menú y pedir" (la tarjeta entera ya navega: era un botón violeta por
            tienda), sin brillo ni salto al pasar el mouse. */}
        <div className={cn(
          // Fila en celular, tarjeta apilada de sm en adelante. Un solo markup: evita
          // duplicar el DOM con `sm:hidden` / `hidden sm:block`.
          isCarousel ? 'flex flex-col' : 'flex flex-row sm:flex-col',
        )}>
          {/* --- Imagen --- */}
          <div
            className={cn(
              'relative shrink-0 overflow-hidden',
              isCarousel ? 'aspect-[16/10] w-full' : 'h-24 w-24 self-center rounded-xl ml-3 my-2 sm:ml-0 sm:my-0 sm:h-auto sm:w-full sm:self-auto sm:rounded-none sm:aspect-[16/10]',
            )}
          >
            <StoreImage
              src={store.imageUrl}
              name={store.name}
              category={store.category}
              seed={store.id}
              grayscale={!isOpen}
              sizes={isCarousel ? '260px' : '(max-width: 640px) 104px, 320px'}
              initialsClassName={isCarousel ? 'text-3xl' : 'text-2xl sm:text-3xl'}
            />
          </div>

          {/* --- Contenido --- */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2">
              <h3 className="line-clamp-1 font-headline text-sm font-bold sm:text-base">{store.name}</h3>
              {(store.maxDiscountPercent || 0) > 0 && (
                <span className="shrink-0 rounded-full bg-cat-food px-2 py-0.5 text-xs font-bold text-black">
                  Hasta -{store.maxDiscountPercent}%
                </span>
              )}
            </div>

            {/* Rubro coloreado por familia + tiempo estimado */}
            <p className="line-clamp-1 text-xs sm:text-[13px]">
              <span className={cn('font-bold', catStyle.text)}>{formatCategoryLabel(store.category ?? '') || 'General'}</span>
              <span className="text-muted-foreground"> · Llega en {store.deliveryTime || '30-45 min'}</span>
            </p>

            <div className="flex items-center gap-3 text-xs sm:text-[13px]">
              {(store.rating || 0) > 0 && (
                <span className="flex items-center gap-1 font-bold text-warning">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {store.rating?.toFixed(1).replace('.', ',')}
                </span>
              )}
              {deliveryFee !== undefined && (
                <span className="text-muted-foreground">
                  Envío {deliveryFeeFrom ? 'desde ' : ''}${deliveryFee.toLocaleString('es-AR')}
                </span>
              )}
              <span className={cn('font-bold', isOpen ? 'text-success' : 'text-muted-foreground')}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Favorito */}
        {!hideFavorite && (
        <button
          type="button"
          onClick={(e) => onToggleFavorite(e, store)}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className="absolute right-1 top-1 z-10 grid h-10 w-10 place-items-center rounded-full bg-background/80 transition-colors hover:bg-background"
        >
          <Heart className={cn('h-4 w-4 transition-colors', isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground')} />
        </button>
        )}
      </Card>
    </Link>
  );
}
