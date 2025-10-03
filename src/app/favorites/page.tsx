
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
import { Heart, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Rating } from '@/components/ui/rating';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const { 
    prototypeStores, 
    loading: prototypeLoading, 
    favoriteStores, 
    toggleFavoriteStore,
    favoriteProducts,
    toggleFavoriteProduct
  } = usePrototypeData();
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
  
  const favoriteProductDetails = useMemo(() => {
      if (prototypeLoading) return [];
      
      const favProducts: (Product & { storeId: string; storeName: string })[] = [];

      prototypeStores.forEach(store => {
          store.products.forEach(product => {
              if (favoriteProducts.includes(product.id)) {
                  favProducts.push({
                      ...product,
                      storeId: store.id,
                      storeName: store.name,
                  });
              }
          });
      });
      return favProducts;
  }, [prototypeStores, favoriteProducts, prototypeLoading]);


  const isLoading = authLoading || prototypeLoading;

  const handleFavoriteStoreToggle = (e: React.MouseEvent, storeId: string, storeName: string) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavoriteStore(storeId);
    toast({
      title: 'Eliminado de Favoritos',
      description: `${storeName} ha sido eliminado de tus tiendas favoritas.`,
    });
  };

  const handleFavoriteProductToggle = (productId: string, productName: string) => {
    toggleFavoriteProduct(productId);
     toast({
      title: 'Eliminado de Favoritos',
      description: `${productName} ha sido eliminado de tus productos favoritos.`,
    });
  };

  return (
    <div className="container mx-auto">
      <PageHeader title="Mis Favoritos" description="Tus tiendas y productos preferidos en un solo lugar." />
      
      <Tabs defaultValue="stores" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stores">
                <StoreIcon className="mr-2 h-4 w-4" />
                Tiendas
            </TabsTrigger>
            <TabsTrigger value="products">
                <ShoppingBag className="mr-2 h-4 w-4" />
                Productos
            </TabsTrigger>
        </TabsList>
        <TabsContent value="stores" className="mt-4">
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
                            onClick={(e) => handleFavoriteStoreToggle(e, store.id, store.name)}
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
                            <StoreIcon className="h-12 w-12 mb-4" />
                            <h3 className="text-lg font-semibold">Tu lista de tiendas está vacía</h3>
                            <p className="text-sm">Aún no has guardado ninguna tienda como favorita.</p>
                            <Button variant="link" asChild className="mt-2">
                                <Link href="/">Explorar tiendas</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
                )}
            </div>
        </TabsContent>
        <TabsContent value="products" className="mt-4">
            {isLoading ? (
                 <div className="space-y-4">
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            ) : favoriteProductDetails.length > 0 ? (
                <div className="space-y-4">
                    {favoriteProductDetails.map(product => (
                        <Card key={product.id} className="overflow-hidden">
                            <CardContent className="p-4 flex items-start gap-4">
                                <Image
                                    src={product.imageUrl!}
                                    alt={product.name}
                                    width={80}
                                    height={80}
                                    className="rounded-md object-cover"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold">{product.name}</p>
                                    <Link href={`/stores/${product.storeId}`} className="text-sm text-muted-foreground hover:underline">{product.storeName}</Link>
                                    <p className="font-bold mt-2">${product.price.toFixed(2)}</p>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleFavoriteProductToggle(product.id, product.name)}
                                    className="text-red-500 hover:bg-red-500/10"
                                    aria-label="Quitar producto de favoritos"
                                >
                                    <Heart className="h-5 w-5 fill-current" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                 <div className="col-span-full">
                    <Card>
                        <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-64">
                            <ShoppingBag className="h-12 w-12 mb-4" />
                            <h3 className="text-lg font-semibold">Tu lista de productos está vacía</h3>
                            <p className="text-sm">Marca el corazón en los productos que te gustan para guardarlos aquí.</p>
                        </CardContent>
                    </Card>
                </div>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
