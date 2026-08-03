'use client';

import Link from 'next/link';
import { Heart, Star, MapPin, Clock, Bike } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StoreImage } from '@/components/store-image';
import { getCategoryStyle } from '@/lib/category-style';

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
  store, isFavorite, isOpen, statusLabel, deliveryFee, onToggleFavorite,
  variant = 'grid', index = 0, cleanAddress, hideFavorite,
}: StoreCardProps) {
  const catStyle = getCategoryStyle(store.category || '');
  const isCarousel = variant === 'carousel';
  const address = cleanAddress ? cleanAddress(store.address) : store.address;

  return (
    <Link
      href={`/stores/${store.id}`}
      className={cn('group block stagger-in', isCarousel && 'w-[260px] shrink-0')}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <Card
        className={cn(
          'relative h-full overflow-hidden border-transparent transition-all duration-300',
          'hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow',
          // Fila en celular, tarjeta apilada de sm en adelante. Un solo markup: evita
          // duplicar el DOM con `sm:hidden` / `hidden sm:block`.
          isCarousel ? 'flex flex-col' : 'flex flex-row sm:flex-col',
        )}
      >
        {/* --- Imagen --- */}
        <div
          className={cn(
            'relative shrink-0 overflow-hidden',
            isCarousel ? 'aspect-[16/10] w-full' : 'h-28 w-28 sm:h-auto sm:w-full sm:aspect-[16/10]',
          )}
        >
          <StoreImage
            src={store.imageUrl}
            name={store.name}
            category={store.category}
            seed={store.id}
            grayscale={!isOpen}
            sizes={isCarousel ? '260px' : '(max-width: 640px) 112px, 320px'}
            initialsClassName={isCarousel ? 'text-3xl' : 'text-2xl sm:text-3xl'}
          />

          {/* Estado (arriba izq.) */}
          <span
            className={cn(
              'absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm',
              isOpen ? 'bg-success/90 text-success-foreground' : 'bg-black/70 text-white',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', isOpen ? 'bg-white animate-pulse-glow' : 'bg-muted-foreground')} />
            {statusLabel}
          </span>

          {/* Descuento (abajo der.) — usa el campo denormalizado, 0 lecturas extra */}
          {(store.maxDiscountPercent || 0) > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-bold text-white shadow-glow-sm">
              -{store.maxDiscountPercent}%
            </span>
          )}
        </div>

        {/* --- Contenido --- */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-headline text-sm font-bold sm:text-base">{store.name}</h3>
            {(store.rating || 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-warning">
                <Star className="h-3 w-3 fill-current" />
                {store.rating?.toFixed(1)}
              </span>
            )}
          </div>

          {/* Rubro con el color de su categoría */}
          <div className="flex items-center gap-1.5">
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', catStyle.bg, catStyle.text)}>
              {store.category || 'General'}
            </span>
          </div>

          {address && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{address}</span>
            </p>
          )}

          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {store.deliveryTime || '30-45 min'}
            </span>
            {deliveryFee !== undefined && (
              <span className="flex items-center gap-1">
                <Bike className="h-3 w-3" />
                ${deliveryFee.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Favorito */}
        {!hideFavorite && (
        <button
          type="button"
          onClick={(e) => onToggleFavorite(e, store)}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className="absolute right-1.5 top-1.5 z-10 rounded-full bg-background/70 p-1.5 backdrop-blur-sm transition-all hover:scale-110 hover:bg-background sm:right-2 sm:top-2"
        >
          <Heart className={cn('h-4 w-4 transition-colors', isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground')} />
        </button>
        )}
      </Card>
    </Link>
  );
}
