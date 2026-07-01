import { Star } from 'lucide-react';

// Estrellas de rating compartidas — antes vivía duplicado e inline en
// my-store/reviews/page.tsx; ahora también lo usa la sección pública de reseñas
// de la tienda (stores/[storeId]/page.tsx).
export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star key={star} className={`${cls} ${rating >= star ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`} />
      ))}
    </div>
  );
}
