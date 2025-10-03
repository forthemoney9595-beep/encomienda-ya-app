'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import type { Store, Product } from '@/lib/placeholder-data';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { Button } from '@/components/ui/button';
import { Heart, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Rating } from '@/components/ui/rating';
import { useRouter } from 'next/navigation';

// Helper to calculate a store's average rating
const calculateStoreRating = (products: Product[]): number => {
  if (!products || products.length === 0) return 0;

  let totalRatingPoints = 0;
  let totalReviews = 0;

  products.forEach(product => {
    if (product.reviewCount > 0) {
      totalRatingPoints += product.rating * product.reviewCount;
      totalReviews += product.reviewCount;
    }
  });

  if (totalReviews === 0) return 0;

  return totalRatingPoints / totalReviews;
};

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const { prototypeStores, loading: prototypeLoading, favoriteStores, toggleFavoriteStore } = usePrototypeData();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const favoriteStoreDetails = useMemo(() => {
    if (prototypeLoading) return [];
    
    return prototypeStores
      .filter(store => favoriteStores.includes(store.id))
      .map(store => ({
        ...store,
        averageRating: calculateStoreRating(store.products),
      }));
  }, [prototypeStores, favoriteStores, prototypeLoading]);
  
  const isLoading = authLoading || prototypeLoading;

  const handleFavoriteToggle = (e: React.MouseEvent, storeId: string, storeName: string) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavoriteStore(storeId);
    toast({
      title: 'Eliminado de Favoritos',
      description: `${storeName} ha sido eliminado de tus favoritos.`,
    });
  };

  return (
    <div className="container mx-auto">
      <PageHeader title="Mis Favoritos" description="Tus tiendas preferidas en un solo lugar." />
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          <>
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
          </>
        ) : favoriteStoreDetails.length > 0 ? (
          favoriteStoreDetails.map((store) => {
            const isFavorite = favoriteStores.includes(store.id);
            return (
            <Link href={`/stores/${store.id}`} key={store.id} className="group">
              <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
                <div className="relative h-48 w-full">
                  <Image
                    src={store.imageUrl}
                    alt={store.name}
                    fill
                    style={{ objectFit: 'cover' }}
                    className="transition-transform duration-300 group-hover:scale-105"
                    data-ai-hint={store.imageHint}
                  />
                  <Button
                    size="icon"
                    className={cn(
                        "absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70",
                        isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => handleFavoriteToggle(e, store.id, store.name)}
                    aria-label="Quitar de favoritos"
                  >
                    <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                  </Button>
                </div>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{store.name}</CardTitle>
                      <CardDescription>{store.category}</CardDescription>
                    </div>
                    {store.averageRating > 0 && (
                       <div className="flex items-center gap-1 text-sm shrink-0">
                         <Rating rating={store.averageRating} size={16} />
                         <span className="font-bold text-muted-foreground">({store.averageRating.toFixed(1)})</span>
                       </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{store.address}</p>
                </CardContent>
              </Card>
            </Link>
          )})
        ) : (
          <div className="col-span-full">
            <Card>
                <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-64">
                    <ShoppingBag className="h-12 w-12 mb-4" />
                    <h3 className="text-lg font-semibold">Tu Cámara del Tesoro está vacía</h3>
                    <p className="text-sm">Aún no has guardado ninguna tienda como favorita.</p>
                     <Button variant="link" asChild className="mt-2">
                        <Link href="/">Explorar tiendas</Link>
                    </Button>
                </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
