'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { money } from '@/lib/format-money';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useAuth } from '@/context/auth-context';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { Button } from '@/components/ui/button';
import { Heart, ShoppingBag, Store as StoreIcon, Package } from 'lucide-react';
import { StoreCard } from '@/components/store-card';
import { SlidingPill } from '@/components/buyer-motion';
import { PricePill } from '@/components/price-pill';
import { normalizeSchedule, getStoreOpenStatus, isStorePaused } from '@/lib/store-hours';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { collection, doc, deleteDoc } from 'firebase/firestore';

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
  schedule?: any;
  weeklySchedule?: any;
  manuallyPaused?: boolean;
  pausedUntil?: unknown;
  maxDiscountPercent?: number;
}

export default function FavoritesPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState('stores');
  const tabsRef = useRef<HTMLDivElement>(null);

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

  const { data: favoritesData, isLoading: favoritesLoading } = useCollection<{id: string, type?: string, storeId?: string, storeName?: string, name?: string, imageUrl?: string, price?: number}>(favoritesQuery);

  // Crear un Set de IDs para búsqueda rápida — solo favoritos de TIENDA (los de producto
  // llevan type:'product' y se filtran aparte, ver favoriteProducts abajo).
  const favoriteIds = useMemo(
    () => new Set(favoritesData?.filter(f => f.type !== 'product').map(f => f.id)),
    [favoritesData],
  );

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

  const favoriteProducts = useMemo(
    () => (favoritesData || []).filter(f => f.type === 'product'),
    [favoritesData],
  );

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
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <StoreCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Mis Favoritos" description="Tus tiendas y productos preferidos en un solo lugar." />

      {/* Vidrio (9/11/2026): solapas en vidrio con la píldora de la marca que se desliza; las
          tiendas usan la MISMA tarjeta que el inicio (con estado abierto/cerrado, que antes no
          se veía acá) y los productos van en tarjetitas de vidrio con el precio en píldora. */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList ref={tabsRef} className="glass relative grid h-auto w-full grid-cols-2 gap-1 rounded-full p-1 sm:max-w-md">
            <SlidingPill containerRef={tabsRef} activeSelector='[data-state="active"]' activeKey={tab} className="rounded-full bg-primary shadow-sm" />
            <TabsTrigger value="stores" className="relative z-[1] min-h-[44px] rounded-full font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none">
                <StoreIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                Tiendas ({favoriteStores.length})
            </TabsTrigger>
            <TabsTrigger value="products" className="relative z-[1] min-h-[44px] rounded-full font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none">
                <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />
                Productos ({favoriteProducts.length})
            </TabsTrigger>
        </TabsList>

        <TabsContent value="stores" className="mt-6">
            {favoriteStores.length === 0 ? (
                <Card className="px-5 py-12 text-center">
                    <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-card bg-primary/10"><Heart className="h-8 w-8 text-primary" aria-hidden="true" /></span>
                    <h3 className="font-headline text-2xl font-extrabold">Todavía no tenés tiendas favoritas</h3>
                    <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">Tocá el corazón en las tiendas que te gusten para tenerlas a mano acá.</p>
                    <Button onClick={() => router.push('/')} className="h-11 rounded-full px-6">Explorar tiendas</Button>
                </Card>
            ) : (
                <div className="glass grid gap-0 rounded-card px-3 sm:grid-cols-2 sm:gap-5 sm:border-0 sm:bg-transparent sm:px-0 sm:shadow-none sm:backdrop-blur-none lg:grid-cols-3 xl:grid-cols-4 [&>a:last-child>div]:border-b-0">
                    {favoriteStores.map((store, i) => {
                        // Mismo criterio que el inicio: la pausa manual aparte del horario.
                        const st = isStorePaused(store)
                            ? { isOpen: false, label: 'Pausada' }
                            : getStoreOpenStatus(normalizeSchedule(store));
                        return (
                            <StoreCard
                                key={store.id}
                                store={store}
                                isFavorite
                                isOpen={st.isOpen}
                                statusLabel={st.label}
                                onToggleFavorite={(e) => handleRemoveFavorite(e, store.id, store.name)}
                                index={i}
                            />
                        );
                    })}
                </div>
            )}
        </TabsContent>

        <TabsContent value="products" className="mt-6">
            {favoriteProducts.length === 0 ? (
                <Card className="px-5 py-12 text-center">
                    <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-card bg-primary/10"><ShoppingBag className="h-8 w-8 text-primary" aria-hidden="true" /></span>
                    <h3 className="font-headline text-2xl font-extrabold">Todavía no tenés productos favoritos</h3>
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">Abrí un producto dentro de una tienda y tocá el corazón para guardarlo acá.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                    {favoriteProducts.map((product, i) => (
                        <Link
                            href={`/stores/${product.storeId}`}
                            key={product.id}
                            className="stagger-in group block rounded-card outline-none transition-transform duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100"
                            style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                        >
                            <Card className="relative flex h-full items-center gap-3 overflow-hidden p-3 sm:flex-col sm:items-stretch sm:p-0">
                                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-foreground/[0.05] sm:h-36 sm:w-full sm:rounded-none">
                                    {product.imageUrl ? (
                                        <Image
                                            src={product.imageUrl}
                                            alt={product.name || ''}
                                            fill
                                            sizes="(max-width: 640px) 80px, 320px"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <span className="grid h-full w-full place-items-center"><Package className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" /></span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 pr-11 sm:p-4 sm:pr-4">
                                    <p className="font-headline text-xl font-extrabold leading-tight line-clamp-1">{product.name}</p>
                                    <p className="text-sm text-muted-foreground line-clamp-1">{product.storeName}</p>
                                    <PricePill value={product.price || 0} className="mt-2 text-base" />
                                </div>
                                <button
                                    onClick={(e) => handleRemoveFavorite(e, product.id, product.name || 'Producto')}
                                    aria-label={`Quitar ${product.name || 'producto'} de favoritos`}
                                    className={cn('absolute right-1 top-1 z-10 grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100 sm:glass-strong sm:right-2 sm:top-2')}
                                >
                                    <Heart className="h-[18px] w-[18px] fill-primary text-primary" aria-hidden="true" />
                                </button>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
