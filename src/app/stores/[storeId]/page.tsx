'use client';

import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/lib/firebase';
import { doc, collection, query, orderBy, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardFooter, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Store as StoreIcon, MapPin, Star, Plus, Minus, Package, Clock, Info, Share2, MessageSquare, ChevronRight, ChevronLeft, Search, X, ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/category-style';
import { normalizeSchedule, getStoreOpenStatus, formatRanges, type WeeklySchedule } from '@/lib/store-hours';
import { StarRating } from '@/components/star-rating';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface StoreData {
  name: string;
  description?: string;
  address?: string;
  imageUrl?: string;
  schedule?: { open: string; close: string };
  weeklySchedule?: WeeklySchedule;
  rating?: number;
  ratingCount?: number;
  manuallyPaused?: boolean;
}

interface Review {
  id: string;
  userName: string;
  rating: number;
  comment?: string;
  ownerReply?: string;
  createdAt?: any;
}

const REVIEWS_ANCHOR = 'reviews';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  available?: boolean;
  isFeatured?: boolean;
  stock?: number | null;
  discountPercent?: number | null;
  createdAt?: any;
}

const effectivePrice = (product: Product) =>
    product.discountPercent ? product.price * (1 - product.discountPercent / 100) : product.price;

// ✅ FUNCIÓN DE LIMPIEZA VISUAL (NUEVO)
const cleanAddress = (rawAddress: string | undefined) => {
    if (!rawAddress) return 'Ubicación no disponible';
    if (rawAddress.includes('Ubicación GPS') || rawAddress.includes('lat:') || rawAddress.includes('(-28.')) {
        return 'Ver ubicación en mapa'; // Texto amigable si es coordenada fea
    }
    return rawAddress;
};

// Id de sección para el scroll-to-category (sin tildes/espacios, para que sea un anchor válido)
const categorySlug = (category: string) =>
    `cat-${category.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}`;

export default function StorePublicPage() {
  const params = useParams();
  const storeId = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  
  const firestore = useFirestore();
  const { addToCart, storeId: cartStoreId, totalItems, totalPrice, setCartSheetOpen } = useCart();
  const { toast } = useToast();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [featuredApi, setFeaturedApi] = useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  // Las flechas del carrusel de destacados quedan deshabilitadas cuando no hay a dónde
  // desplazar (ej: solo 2 productos destacados que ya entran completos en pantalla) --
  // sin esto, tocarlas no hacía nada visible y parecía roto en vez de "ya viste todo".
  useEffect(() => {
    if (!featuredApi) return;
    const update = () => {
      setCanScrollPrev(featuredApi.canScrollPrev());
      setCanScrollNext(featuredApi.canScrollNext());
    };
    update();
    featuredApi.on('select', update);
    featuredApi.on('reInit', update);
    return () => { featuredApi.off('select', update); featuredApi.off('reInit', update); };
  }, [featuredApi]);

  // 1. Obtener datos de la TIENDA
  const storeRef = useMemoFirebase(() => {
      return firestore && storeId ? doc(firestore, 'stores', storeId) : null;
  }, [firestore, storeId]);
  
  const { data: store, isLoading: storeLoading } = useDoc<StoreData>(storeRef);

  // 2. Obtener PRODUCTOS — leemos 'items' (actual) y 'products' (legacy) por separado
  // y los combinamos, para que las tiendas viejas con catálogo en la subcolección
  // anterior no le aparezcan vacías al comprador.
  const productsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(collection(firestore, 'stores', storeId, 'items'));
  }, [firestore, storeId]);

  const { data: rawProducts, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  const legacyProductsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(collection(firestore, 'stores', storeId, 'products'));
  }, [firestore, storeId]);

  const { data: rawLegacyProducts, isLoading: legacyProductsLoading } = useCollection<Product>(legacyProductsQuery);

  // 2b. Reseñas públicas (misma colección que usa el dueño en /my-store/reviews,
  // pero de solo lectura acá — sin form de respuesta).
  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(collection(firestore, 'reviews'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));
  }, [firestore, storeId]);
  const { data: reviews } = useCollection<Review>(reviewsQuery);

  // 3. Filtrar y Ordenar
  const products = useMemo(() => {
    const all = [...(rawProducts || []), ...(rawLegacyProducts || [])];
    return all
      .filter(p => p.available === true)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [rawProducts, rawLegacyProducts]);

  // 4. Estado de Apertura (helper compartido: soporta horario por día + franjas de siesta)
  const storeStatus = useMemo((): { isOpen: boolean; label: string; timeRange?: string; paused?: boolean } => {
      if (store?.manuallyPaused) {
          return { isOpen: false, label: 'Pausada temporalmente', paused: true };
      }
      const status = getStoreOpenStatus(normalizeSchedule(store));
      return {
          isOpen: status.isOpen,
          label: status.label,
          timeRange: status.closedToday ? 'Hoy cerrado' : formatRanges(status.todayRanges),
      };
  }, [store]);

  const handleAddToCart = (product: Product) => {
    if (!storeId) return;
    
    if (!storeStatus.isOpen) {
        toast({
            variant: "destructive",
            title: storeStatus.paused ? "Tienda en pausa" : "Tienda Cerrada",
            description: storeStatus.paused
                ? "La tienda pausó los pedidos temporalmente. Probá más tarde."
                : "El local está cerrado en este horario. No se aceptan pedidos ahora."
        });
        return;
    }
    
    addToCart({
      id: product.id,
      name: product.name,
      // Precio ya con descuento aplicado (si tiene) -- así el carrito/checkout, que solo
      // suman el price de cada item, reflejan el descuento sin tocar esos archivos. El
      // servidor en /api/orders/create igual recalcula todo desde el catálogo real.
      price: effectivePrice(product),
      description: product.description,
      category: product.category,
      imageUrl: product.imageUrl,
    }, storeId);
    
    toast({
      title: "Agregado al carrito",
      description: `${product.name} ya está en tu pedido.`,
    });
  };

  if (storeLoading || productsLoading || legacyProductsLoading) return <LoadingSkeleton />;
  if (!store) return <StoreNotFound router={router} />;

  const search = searchTerm.trim().toLowerCase();
  const visibleProducts = search
    ? products.filter(p => (p.name || '').toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search))
    : products;

  const featuredProducts = visibleProducts.filter(p => p.isFeatured);
  const regularProducts = visibleProducts.filter(p => !p.isFeatured);

  // Agrupar por categoría real del producto (selector fijo en el panel de tienda) para que
  // el "Menú Completo" deje de ser una sola grilla con todo mezclado.
  const groupedProducts = Object.entries(
    regularProducts.reduce((groups: Record<string, Product[]>, p) => {
      const cat = (p.category || '').trim() || 'Otros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
      return groups;
    }, {})
  ).sort(([a], [b]) => {
    if (a === 'Otros') return 1;
    if (b === 'Otros') return -1;
    return a.localeCompare(b);
  });

  const scrollToCategory = (category: string) => {
    document.getElementById(categorySlug(category))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToReviews = () => {
    document.getElementById(REVIEWS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const shareData = { title: store?.name || 'Tienda', text: `Mirá ${store?.name} en EncomiendaYA`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Enlace copiado', description: 'Compartilo donde quieras.' });
      }
    } catch {
      // El usuario canceló el share nativo o el navegador no soporta nada de esto -- silencioso.
    }
  };

  const showCartBar = cartStoreId === storeId && totalItems > 0;

  return (
    <>
    <div className={cn('container mx-auto', showCartBar && 'pb-24')}>
      {/* BANNER */}
      <div className="relative -mx-4 sm:mx-0 sm:mt-4 mb-6">
        <div className="relative aspect-[2.5/1] sm:rounded-2xl overflow-hidden bg-muted">
            {store.imageUrl ? (
                <img src={store.imageUrl} alt={store.name} className="h-full w-full object-cover" />
            ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <StoreIcon className="h-16 w-16 text-primary/40" />
                </div>
            )}
        </div>
      </div>

      {/* INFO */}
      <div className="px-4 sm:px-0 mb-8 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight">{store.name}</h1>
                  <Badge variant={storeStatus.isOpen ? "default" : "destructive"} className={`gap-1 ${storeStatus.isOpen ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}`}>
                      {storeStatus.isOpen ? <Clock className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                      {storeStatus.label}
                  </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={handleShare} className="shrink-0">
                  <Share2 className="h-4 w-4 mr-2" /> Compartir
              </Button>
          </div>

          <p className="text-muted-foreground max-w-2xl">{store.description || 'Sin descripción disponible.'}</p>

          {/* Tarjeta de info: rating clickeable + dirección + horario, con más jerarquía que una línea de texto suelta */}
          <div className="rounded-xl border bg-card divide-y sm:divide-y-0 sm:divide-x sm:flex">
              {(store.rating || 0) > 0 ? (
                  <button
                      onClick={scrollToReviews}
                      className="flex items-center gap-2 p-3 sm:flex-1 text-left hover:bg-muted/40 transition-colors group"
                  >
                      <div className="h-9 w-9 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0">
                          <Star className="h-4.5 w-4.5 fill-current" />
                      </div>
                      <div className="min-w-0">
                          <p className="font-semibold text-sm flex items-center gap-1">
                              {store.rating?.toFixed(1)}
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                          </p>
                          <p className="text-xs text-muted-foreground">{store.ratingCount || 0} reseña{store.ratingCount === 1 ? '' : 's'}</p>
                      </div>
                  </button>
              ) : (
                  <div className="flex items-center gap-2 p-3 sm:flex-1">
                      <div className="h-9 w-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                          <Star className="h-4.5 w-4.5" />
                      </div>
                      <p className="text-xs text-muted-foreground">Todavía sin reseñas</p>
                  </div>
              )}

              {store.address && (
                  <div className="flex items-center gap-2 p-3 sm:flex-1 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-info/15 text-info flex items-center justify-center shrink-0">
                          <MapPin className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{cleanAddress(store.address)}</p>
                          <p className="text-xs text-muted-foreground">Dirección</p>
                      </div>
                  </div>
              )}

              {(store.weeklySchedule || store.schedule) && (
                  <div className="flex items-center gap-2 p-3 sm:flex-1 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                          <Clock className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{storeStatus.timeRange}</p>
                          <p className="text-xs text-muted-foreground">Horario de hoy</p>
                      </div>
                  </div>
              )}
          </div>

          <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Buscar en ${store.name}...`}
                  className="pl-9 pr-9"
              />
              {searchTerm && (
                  <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                  >
                      <X className="h-4 w-4" />
                  </button>
              )}
          </div>
      </div>

      {!storeStatus.isOpen && (
          <div className="bg-destructive/10 border border-destructive/30 text-foreground p-4 rounded-lg mb-8 text-center animate-in fade-in slide-in-from-top-2">
              <p className="font-semibold">
                  {storeStatus.paused ? '⏸️ Este local pausó temporalmente los pedidos.' : '🔴 Este local se encuentra cerrado en este momento.'}
              </p>
              <p className="text-sm">
                  {storeStatus.paused
                      ? 'Puedes ver el menú, pero la tienda no está aceptando pedidos en este momento.'
                      : 'Puedes ver el menú, pero no podrás realizar pedidos hasta que abra.'}
              </p>
          </div>
      )}

      {/* NAVEGACIÓN POR CATEGORÍA */}
      {groupedProducts.length > 1 && (
          <div className="sticky top-14 sm:top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-3 mb-6 border-b sm:border-b-0">
              <div className="flex gap-4 overflow-x-auto no-scrollbar">
                  {groupedProducts.map(([category], i) => {
                      const style = getCategoryStyle(category, i);
                      const Icon = style.icon;
                      return (
                          <button
                              key={category}
                              onClick={() => scrollToCategory(category)}
                              className="flex flex-col items-center gap-1.5 shrink-0 opacity-80 hover:opacity-100 transition-opacity"
                          >
                              <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm', style.bg)}>
                                  <Icon className={cn('h-5 w-5', style.text)} />
                              </div>
                              <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">{category}</span>
                          </button>
                      );
                  })}
              </div>
          </div>
      )}

      {/* DESTACADOS — carrusel horizontal (swipe en celular, flechas en desktop) */}
      {featuredProducts.length > 0 && (
        <div className="mb-10 px-4 sm:px-0">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline text-xl font-bold flex items-center gap-2">
                    <Star className="h-5 w-5 text-warning fill-current" /> Recomendados
                </h2>
                <div className="hidden sm:flex gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => featuredApi?.scrollPrev()} disabled={!canScrollPrev}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => featuredApi?.scrollNext()} disabled={!canScrollNext}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <Carousel opts={{ align: 'start', dragFree: true }} setApi={setFeaturedApi}>
                <CarouselContent>
                    {featuredProducts.map(product => (
                        <CarouselItem key={product.id} className="basis-[78%] sm:basis-1/2 lg:basis-1/3">
                            <ProductCard product={product} onAdd={handleAddToCart} isFeatured isDisabled={!storeStatus.isOpen} />
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>
        </div>
      )}

      {/* MENU COMPLETO, AGRUPADO POR CATEGORÍA */}
      {search && visibleProducts.length === 0 ? (
        <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Sin resultados para &quot;{searchTerm}&quot;.</p>
            <button onClick={() => setSearchTerm('')} className="text-sm text-primary underline mt-2">Limpiar búsqueda</button>
        </div>
      ) : products.length > 0 ? (
        groupedProducts.map(([category, items]) => (
            <div key={category} id={categorySlug(category)} className="mb-10 scroll-mt-32 sm:scroll-mt-20">
                <h2 className="font-headline text-xl font-bold mb-2">{category}</h2>
                <div>
                    {items.map(product => (
                        <ProductRow key={product.id} product={product} onAdd={handleAddToCart} isDisabled={!storeStatus.isOpen} />
                    ))}
                </div>
            </div>
        ))
      ) : (
        <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Esta tienda aún no tiene productos disponibles.</p>
        </div>
      )}

      {/* RESEÑAS PÚBLICAS */}
      <div id={REVIEWS_ANCHOR} className="mb-10 scroll-mt-32 sm:scroll-mt-20 px-4 sm:px-0">
          <h2 className="font-headline text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Reseñas de la tienda
          </h2>
          {(!reviews || reviews.length === 0) ? (
              <div className="text-center py-10 bg-muted/10 rounded-lg border border-dashed">
                  <p className="text-muted-foreground">Todavía no hay reseñas. Sé el primero en calificar después de tu pedido.</p>
              </div>
          ) : (
              <div className="space-y-4">
                  {reviews.slice(0, 10).map(review => (
                      <Card key={review.id}>
                          <CardContent className="py-4 space-y-2">
                              <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm">{review.userName}</span>
                                  <StarRating rating={review.rating} />
                              </div>
                              {review.createdAt?.seconds && (
                                  <p className="text-xs text-muted-foreground">
                                      {format(new Date(review.createdAt.seconds * 1000), "d MMM yyyy", { locale: es })}
                                  </p>
                              )}
                              {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
                              {review.ownerReply && (
                                  <div className="mt-2 bg-muted/30 border-l-2 border-primary/40 rounded-r-md p-3">
                                      <p className="text-xs font-semibold text-primary mb-1">Respuesta de la tienda</p>
                                      <p className="text-sm text-muted-foreground">{review.ownerReply}</p>
                                  </div>
                              )}
                          </CardContent>
                      </Card>
                  ))}
              </div>
          )}
      </div>
    </div>

    {/* BARRA DE CARRITO FLOTANTE — solo si el carrito activo es el de esta tienda.
        bottom-nav (celular, solo compradores) ocupa 4rem + safe-area, por eso el
        offset en mobile; en desktop no hay bottom-nav, así que va pegada abajo. */}
    {showCartBar && (
        <button
            onClick={() => setCartSheetOpen(true)}
            className="fixed inset-x-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)] md:bottom-6"
        >
            <span className="flex items-center gap-2 font-semibold">
                <ShoppingBag className="h-5 w-5" />
                {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
            </span>
            <span className="font-bold">Ver carrito · ${totalPrice.toLocaleString()}</span>
        </button>
    )}
    </>
  );
}

function LoadingSkeleton() {
    return (
      <div className="container mx-auto space-y-8 py-8">
        <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
            </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      </div>
    );
}

function StoreNotFound({ router }: { router: any }) {
    return (
        <div className="container mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold text-muted-foreground">Tienda no encontrada</h2>
            <Button variant="link" onClick={() => router.push('/')}>Volver al inicio</Button>
        </div>
    );
}

function ProductCard({ product, onAdd, isFeatured, isDisabled }: { product: Product, onAdd: (p: Product) => void, isFeatured?: boolean, isDisabled?: boolean }) {
    const outOfStock = product.stock != null && product.stock <= 0;
    return (
        <Card className={`flex flex-col overflow-hidden border hover:shadow-md transition-all ${isFeatured ? 'border-warning/30 bg-warning/5' : ''} ${(isDisabled || outOfStock) ? 'opacity-70 grayscale' : ''}`}>
            <div className="relative h-40 w-full bg-muted flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover hover:scale-105 transition-transform duration-500" />
                ) : (
                    <Package className="h-10 w-10 text-muted-foreground/50" />
                )}
                {isFeatured && (
                    <span className="absolute top-2 right-2 bg-warning text-warning-foreground text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
                        POPULAR
                    </span>
                )}
                {!outOfStock && product.stock != null && product.stock <= 3 && (
                    <span className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
                        Quedan {product.stock}
                    </span>
                )}
                {!!product.discountPercent && (
                    <span className="absolute bottom-2 left-2 bg-success text-success-foreground text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
                        -{product.discountPercent}%
                    </span>
                )}
            </div>
            <CardHeader className="p-4 pb-0">
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base line-clamp-1">{product.name}</CardTitle>
                    <span className="flex flex-col items-end shrink-0">
                        {!!product.discountPercent && (
                            <span className="text-xs text-muted-foreground line-through">${product.price}</span>
                        )}
                        <span className="font-bold text-foreground">${effectivePrice(product).toFixed(0)}</span>
                    </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1 h-8">{product.description}</p>
            </CardHeader>
            <CardFooter className="p-4 mt-auto">
                {outOfStock ? (
                    <Button className="w-full" size="sm" disabled>Sin stock</Button>
                ) : (
                    <QuantityControl product={product} onAdd={onAdd} isDisabled={isDisabled} maxQuantity={product.stock ?? undefined} />
                )}
            </CardFooter>
        </Card>
    );
}

function ProductRow({ product, onAdd, isDisabled }: { product: Product, onAdd: (p: Product) => void, isDisabled?: boolean }) {
    const outOfStock = product.stock != null && product.stock <= 0;
    return (
        <div className={cn('flex items-center gap-4 py-4 border-b last:border-0', (isDisabled || outOfStock) && 'opacity-60')}>
            <div className="flex-1 min-w-0">
                <h3 className="font-semibold line-clamp-1">{product.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
                <p className="mt-1.5 flex items-center gap-2">
                    {!!product.discountPercent && (
                        <span className="text-xs text-muted-foreground line-through">${product.price}</span>
                    )}
                    <span className="font-bold text-foreground">${effectivePrice(product).toFixed(0)}</span>
                    {!!product.discountPercent && (
                        <span className="text-xs font-bold text-success">-{product.discountPercent}%</span>
                    )}
                </p>
                {outOfStock ? (
                    <p className="text-xs font-medium text-destructive mt-1">Sin stock</p>
                ) : product.stock != null && product.stock <= 3 ? (
                    <p className="text-xs font-medium text-destructive mt-1">Quedan {product.stock}</p>
                ) : null}
            </div>
            <div className="relative h-20 w-20 shrink-0">
                <div className="h-20 w-20 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                    {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                        <Package className="h-8 w-8 text-muted-foreground/50" />
                    )}
                </div>
                {!outOfStock && (
                    <div className="absolute -bottom-2 -right-2">
                        <QuantityControl product={product} onAdd={onAdd} isDisabled={isDisabled} variant="compact" maxQuantity={product.stock ?? undefined} />
                    </div>
                )}
            </div>
        </div>
    );
}

// Botón "Agregar" / píldora de cantidad — refleja si el producto ya está en el carrito
// (antes "Agregar" no cambiaba nunca, sin importar cuántas unidades ya tuvieras en el carrito).
function QuantityControl({ product, onAdd, isDisabled, variant = 'full', maxQuantity }: { product: Product, onAdd: (p: Product) => void, isDisabled?: boolean, variant?: 'full' | 'compact', maxQuantity?: number }) {
    const { cart, updateQuantity, removeFromCart } = useCart();
    const quantity = cart.find(i => i.id === product.id)?.quantity || 0;
    const atMax = maxQuantity != null && quantity >= maxQuantity;

    const dec = () => quantity <= 1 ? removeFromCart(product.id) : updateQuantity(product.id, quantity - 1);
    const inc = () => { if (!atMax) updateQuantity(product.id, quantity + 1); };

    if (variant === 'compact') {
        if (quantity === 0) {
            return (
                <button
                    onClick={() => onAdd(product)}
                    disabled={isDisabled}
                    className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md disabled:opacity-50"
                >
                    <Plus className="h-4 w-4" />
                </button>
            );
        }
        return (
            <div className="flex items-center gap-1 bg-primary text-primary-foreground rounded-full shadow-md px-1 h-7">
                <button onClick={dec} disabled={isDisabled} className="h-5 w-5 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
                <span className="text-xs font-bold w-3 text-center">{quantity}</span>
                <button onClick={inc} disabled={isDisabled || atMax} className="h-5 w-5 flex items-center justify-center disabled:opacity-50"><Plus className="h-3.5 w-3.5" /></button>
            </div>
        );
    }

    if (quantity === 0) {
        return (
            <Button onClick={() => onAdd(product)} className="w-full" size="sm" disabled={isDisabled}>
                {isDisabled ? 'Cerrado' : <><Plus className="h-4 w-4 mr-1" /> Agregar</>}
            </Button>
        );
    }
    return (
        <div className="flex items-center justify-between w-full rounded-md border border-primary/30 bg-primary/10">
            <button onClick={dec} disabled={isDisabled} className="h-9 w-10 flex items-center justify-center text-primary disabled:opacity-50"><Minus className="h-4 w-4" /></button>
            <span className="font-bold text-sm text-foreground">{quantity} en el carrito</span>
            <button onClick={inc} disabled={isDisabled || atMax} className="h-9 w-10 flex items-center justify-center text-primary disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </div>
    );
}