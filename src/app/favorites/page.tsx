'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useAuth } from '@/context/auth-context';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { Button } from '@/components/ui/button';
import { Heart, ShoppingBag, Store as StoreIcon, MapPin, Clock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Rating } from '@/components/ui/rating';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { collection, doc, deleteDoc, setDoc } from 'firebase/firestore';

// Interfaz compatible con los datos de Firestore
interface Store {
  id: string;
  name: string;
  category: string;
  description?: string;
  rating?: number;
  imageUrl?: string;
  imageHint?: string;
  deliveryTime?: string;
  minOrder?: number;
  address?: string;
  isApproved?: boolean;
  available?: boolean;
}

export default function FavoritesPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  // 1. Consultar todas las Tiendas (para tener los detalles completos)
  const storesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'stores');
  }, [firestore]);

  const { data: allStores, isLoading: storesLoading } = useCollection<Store>(storesQuery);

  // 2. Consultar la Subcolección de Favoritos del Usuario
  const favoritesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'favorites');
  }, [firestore, user]);

  const { data: favoritesData, isLoading: favoritesLoading } = useCollection<{id: string, type?: string}>(favoritesQuery);

  // Crear un Set de IDs para búsqueda rápida
  const favoriteIds = useMemo(() => new Set(favoritesData?.map(f => f.id)), [favoritesData]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Filtrar las tiendas que están en favoritos
  const favoriteStores = useMemo(() => {
    if (!allStores || !favoriteIds) return [];
    return allStores.filter(store => favoriteIds.has(store.id));
  }, [allStores, favoriteIds]);

  // (Futuro: Aquí filtrarías los productos favoritos cuando implementemos esa parte)
  const favoriteProducts: any[] = []; 

  const isLoading = authLoading || storesLoading || favoritesLoading;

  // Manejador para quitar de favoritos
  const handleRemoveFavorite = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !firestore) return;

    try {
        await deleteDoc(doc(firestore, 'users', user.uid, 'favorites', id));
        toast({
            title: 'Eliminado de Favoritos',
            description: `${name} ha sido eliminado de tu lista.`,
        });
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar favoritos.' });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto space-y-6 py-6">
        <PageHeader title="Cargando Favoritos..." description="" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <StoreCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Mis Favoritos" description="Tus tiendas y productos preferidos en un solo lugar." />
      
      <Tabs defaultValue="stores" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stores">
                <StoreIcon className="mr-2 h-4 w-4" />
                Tiendas ({favoriteStores.length})
            </TabsTrigger>
            <TabsTrigger value="products" disabled>
                <ShoppingBag className="mr-2 h-4 w-4" />
                Productos (Próximamente)
            </TabsTrigger>
        </TabsList>
        
        <TabsContent value="stores" className="mt-6">
             <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {favoriteStores.length === 0 ? (
                    <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                        <Heart className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">No tienes tiendas favoritas</h3>
                        <p className="text-sm text-muted-foreground mb-4">Marca el corazón en las tiendas que te gusten para verlas aquí.</p>
                        <Button variant="outline" onClick={() => router.push('/')}>
                            Explorar Tiendas
                        </Button>
                    </div>
                ) : (
                    favoriteStores.map((store) => (
                        <Link href={`/stores/${store.id}`} key={store.id} className="group">
                            <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 relative border-transparent hover:border-primary/20">
                                {/* Imagen */}
                                <div className="relative h-48 w-full bg-muted">
                                    {store.imageUrl ? (
                                        <Image
                                            src={store.imageUrl}
                                            alt={store.name}
                                            fill
                                            style={{ objectFit: 'cover' }}
                                            className="transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            <StoreIcon className="h-10 w-10 opacity-20" />
                                        </div>
                                    )}
                                    
                                    {/* Botón Quitar Favorito */}
                                    <button
                                        onClick={(e) => handleRemoveFavorite(e, store.id, store.name)}
                                        className="absolute top-2 right-2 p-2 rounded-full bg-white/90 hover:bg-white shadow-sm backdrop-blur-sm transition-all hover:scale-110 z-10"
                                        title="Quitar de favoritos"
                                    >
                                        <Heart className="h-5 w-5 fill-red-500 text-red-500" />
                                    </button>

                                    <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                                        {store.category || 'General'}
                                    </span>
                                </div>

                                <CardHeader className="p-4 pb-2 space-y-1">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-base font-bold">{store.name}</CardTitle>
                                        {store.rating && (
                                            <div className="flex items-center gap-1 text-xs font-medium bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                                                <Star className="h-3 w-3 fill-yellow-700" />
                                                {store.rating.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3" /> 
                                        <span className="line-clamp-1">{store.address || 'Ubicación desconocida'}</span>
                                    </div>
                                </CardHeader>
                                
                                <CardContent className="p-4 pt-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {store.deliveryTime || '30-45 min'}
                                        </div>
                                        <div>
                                            Envío: ${store.minOrder || '5.00'}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
            <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Próximamente</h3>
                <p className="text-sm text-muted-foreground">Pronto podrás guardar tus productos favoritos individualmente.</p>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}