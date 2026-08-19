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
          'relative flex h-full flex-col overflow-hidden border-transparent transition-all duration-300',
          'hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow',
        )}
      >
        {/* Rediseño visual (19/8, "Mezcla de David"): badge de descuento junto al nombre,
            rubro en el color de su FAMILIA + "Llega en...", fila de detalles con el
            estado en texto (verde "Abierto"), y botón "Ver menú y pedir". */}
        <div className={cn(
          // Fila en celular, tarjeta apilada de sm en adelante. Un solo markup: evita
          // duplicar el DOM con `sm:hidden` / `hidden sm:block`.
          isCarousel ? 'flex flex-col' : 'flex flex-row sm:flex-col',
        )}>
          {/* --- Imagen --- */}
          <div
            className={cn(
              'relative shrink-0 overflow-hidden',
              isCarousel ? 'aspect-[16/10] w-full' : 'h-[104px] w-[104px] self-center rounded-xl ml-3 sm:ml-0 sm:h-auto sm:w-full sm:self-auto sm:rounded-none sm:aspect-[16/10]',
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
                <span className="shrink-0 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-bold text-white shadow-glow-sm">
                  Hasta -{store.maxDiscountPercent}%
                </span>
              )}
            </div>

            {/* Rubro coloreado por familia + tiempo estimado */}
            <p className="line-clamp-1 text-xs sm:text-[13px]">
              <span className={cn('font-bold', catStyle.text)}>{formatCategoryLabel(store.category) || 'General'}</span>
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

        {/* CTA de la tarjeta — la tarjeta entera ya navega; esto le da la acción obvia.
            Compacto a pedido (19/8): h-9 + texto 13px, el h-10 bold se veía tosco. */}
        <div className="px-3 pb-2.5 sm:px-4 sm:pb-3.5">
          <div className="flex h-9 items-center justify-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
            Ver menú y pedir
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
