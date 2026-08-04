'use client';

import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/lib/firebase';
import { doc, collection, query, orderBy, where, limit } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardFooter, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Store as StoreIcon, MapPin, Star, Plus, Minus, Package, Clock, Info, Share2, MessageSquare, ChevronRight, ChevronLeft, Search, X, ShoppingBag, Home, Heart } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { StoreImage } from '@/components/store-image';
import { StoreCard } from '@/components/store-card';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { setDoc, deleteDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/category-style';
import { normalizeSchedule, getStoreOpenStatus, formatRanges, DAY_LABELS, DISPLAY_ORDER, type WeeklySchedule } from '@/lib/store-hours';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StarRating } from '@/components/star-rating';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface StoreData {
  name: string;
  category?: string;
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
  const { user } = useAuth();
  const { addToCart, storeId: cartStoreId, totalItems, totalPrice, setCartSheetOpen } = useCart();
  const { toast } = useToast();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('menu');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [featuredApi, setFeaturedApi] = useState<CarouselApi>();
  const isProgrammaticScroll = useRef(false);
  const scrollSpyTimeout = useRef<number | undefined>(undefined);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

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
  // OJO escala (regla de la Fase Y): `reviews` crece sin techo, así que va con limit.
  // Antes bajaba TODAS las reseñas de la tienda para mostrar solo las primeras 10.
  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(collection(firestore, 'reviews'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'), limit(20));
  }, [firestore, storeId]);
  const { data: reviews } = useCollection<Review>(reviewsQuery);

  const storeCategory = store?.category;

  // 2c. Otras tiendas del mismo rubro, para poder saltar de una tienda a otra sin tener
  // que volver al inicio. Consulta acotada (igualdad + limit) sobre `stores`, que es una
  // colección chica; no requiere índice compuesto (Firestore combina igualdades solo).
  const relatedQuery = useMemoFirebase(() => {
    if (!firestore || !storeCategory) return null;
    return query(
      collection(firestore, 'stores'),
      where('isApproved', '==', true),
      where('category', '==', storeCategory),
      limit(8),
    );
  }, [firestore, storeCategory]);
  const { data: relatedRaw } = useCollection<any>(relatedQuery);
  const relatedStores = useMemo(
    () => (relatedRaw || []).filter(s => s.id !== storeId),
    [relatedRaw, storeId],
  );

  // 2d. Favoritos de PRODUCTO — misma subcolección que los favoritos de tienda
  // (`users/{uid}/favorites`), distinguidos por `type:'product'` (el resto no tiene ese
  // campo, ver toggleFavorite en page.tsx). Colección chica y acotada al propio usuario.
  const productFavoritesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'favorites');
  }, [firestore, user]);
  const { data: favoritesData } = useCollection<{ id: string; type?: string }>(productFavoritesQuery);
  const favoriteProductIds = useMemo(
    () => new Set((favoritesData || []).filter(f => f.type === 'product').map(f => f.id)),
    [favoritesData],
  );

  const toggleFavoriteProduct = async (product: Product) => {
    if (!user || !firestore) {
      toast({ title: 'Iniciá sesión', description: 'Necesitás una cuenta para guardar favoritos.' });
      return;
    }
    const favRef = doc(firestore, 'users', user.uid, 'favorites', product.id);
    if (favoriteProductIds.has(product.id)) {
      await deleteDoc(favRef);
    } else {
      await setDoc(favRef, {
        id: product.id,
        type: 'product',
        storeId,
        storeName: store?.name || '',
        name: product.name,
        imageUrl: product.imageUrl || '',
        price: effectivePrice(product),
        addedAt: new Date(),
      });
    }
  };

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

  // Scroll-spy: resalta el chip de la categoría que se está mirando (antes ningún chip se
  // marcaba nunca como activo). Va ANTES de los returns tempranos de abajo: los hooks
  // tienen que ejecutarse en el mismo orden en cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab !== 'menu') return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-category-section]'));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveCategory(top.target.getAttribute('data-category-section'));
      },
      // 120px = header (56) + tira de chips; el -70% de abajo hace que se marque la
      // sección cuyo encabezado entra en el tercio superior de la pantalla.
      { rootMargin: '-120px 0px -70% 0px', threshold: 0 },
    );
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [activeTab, searchTerm, products]);

  useEffect(() => () => window.clearTimeout(scrollSpyTimeout.current), []);

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
    // Marcamos el destino a mano y silenciamos el observador mientras dura el scroll:
    // si no, al pasar por las secciones intermedias el chip activo iría parpadeando.
    isProgrammaticScroll.current = true;
    setActiveCategory(category);
    document.getElementById(categorySlug(category))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.clearTimeout(scrollSpyTimeout.current);
    scrollSpyTimeout.current = window.setTimeout(() => { isProgrammaticScroll.current = false; }, 800);
  };

  // Con pestañas, las reseñas ya no están en el mismo scroll: hay que cambiar de pestaña.
  // Si esto siguiera haciendo scrollIntoView, el botón de rating quedaría muerto.
  const scrollToReviews = () => {
    setActiveTab('reviews');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      {/* Volver + migas: antes desde acá no había forma de retroceder en escritorio. */}
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/', icon: Home },
          ...(storeCategory ? [{ label: storeCategory, href: `/?category=${encodeURIComponent(storeCategory)}` }] : []),
          { label: store.name },
        ]}
      />

      {/* BANNER */}
      <div className="relative -mx-4 sm:mx-0 mb-6">
        <div className="relative aspect-[2.5/1] sm:aspect-[3.5/1] sm:rounded-2xl overflow-hidden">
            <StoreImage
              src={store.imageUrl}
              name={store.name}
              category={storeCategory}
              seed={storeId}
              grayscale={!storeStatus.isOpen}
              sizes="(max-width: 640px) 100vw, 1100px"
              priority
              initialsClassName="text-5xl"
            />
            {/* Velo inferior para que el nombre se lea sobre cualquier foto */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
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
                          <Star className="h-[18px] w-[18px] fill-current" />
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
                          <Star className="h-[18px] w-[18px]" />
                      </div>
                      <p className="text-xs text-muted-foreground">Todavía sin reseñas</p>
                  </div>
              )}

              {store.address && (
                  <div className="flex items-center gap-2 p-3 sm:flex-1 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-info/15 text-info flex items-center justify-center shrink-0">
                          <MapPin className="h-[18px] w-[18px]" />
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
                          <Clock className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{storeStatus.timeRange}</p>
                          <p className="text-xs text-muted-foreground">Horario de hoy</p>
                      </div>
                  </div>
              )}
          </div>

      </div>

      {/* El aviso de cerrado queda FUERA de las pestañas: tiene que verse siempre. */}
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

      {/* PESTAÑAS — antes las reseñas quedaban al fondo de todo el scroll del menú. */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 sm:px-0">
        <TabsList className="mb-6 h-auto rounded-full bg-muted/60 p-1">
          {[
            { v: 'menu', label: 'Menú' },
            { v: 'info', label: 'Info' },
            { v: 'reviews', label: `Reseñas${reviews?.length ? ` (${reviews.length})` : ''}` },
          ].map(t => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="rounded-full px-4 py-1.5 text-sm data-[state=active]:bg-brand-gradient data-[state=active]:text-white data-[state=active]:shadow-glow-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="menu" className="mt-0">
          <div className="relative max-w-md mb-6">
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

      {/* NAVEGACIÓN POR CATEGORÍA — top-14 en TODOS los tamaños: el header del shell ahora
          es sticky también en escritorio (antes ahí se volvía transparente, de ahí el
          sm:top-0 original). */}
      {groupedProducts.length > 1 && (
          <div className="sticky top-14 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-3 mb-6 border-b sm:border-b-0">
              <div className="flex gap-4 overflow-x-auto no-scrollbar">
                  {groupedProducts.map(([category]) => {
                      const style = getCategoryStyle(category);
                      const Icon = style.icon;
                      const isActive = activeCategory === category;
                      return (
                          <button
                              key={category}
                              onClick={() => scrollToCategory(category)}
                              aria-current={isActive ? 'true' : undefined}
                              className="flex flex-col items-center gap-1.5 shrink-0 transition-all duration-300 ease-spring"
                          >
                              <div className={cn(
                                  'h-11 w-11 rounded-2xl flex items-center justify-center transition-all duration-300 ease-spring ring-2',
                                  isActive
                                    ? cn('scale-110 shadow-glow ring-offset-2 ring-offset-background', style.solid, style.ring)
                                    : cn('ring-transparent opacity-80 hover:opacity-100', style.bg),
                              )}>
                                  <Icon className={cn('h-5 w-5', isActive ? '' : style.text)} />
                              </div>
                              <span className={cn(
                                'text-[11px] font-medium whitespace-nowrap',
                                isActive ? 'text-foreground' : 'text-muted-foreground',
                              )}>{category}</span>
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
                            <ProductCard product={product} onAdd={handleAddToCart} onOpenDetail={setDetailProduct} isFeatured isDisabled={!storeStatus.isOpen} />
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
            <div key={category} id={categorySlug(category)} data-category-section={category} className="mb-10 scroll-mt-[8.5rem]">
                <h2 className="font-headline text-xl font-bold mb-2">{category}</h2>
                <div>
                    {items.map(product => (
                        <ProductRow key={product.id} product={product} onAdd={handleAddToCart} onOpenDetail={setDetailProduct} isDisabled={!storeStatus.isOpen} />
                    ))}
                </div>
            </div>
        ))
      ) : (
        <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Esta tienda aún no tiene productos disponibles.</p>
        </div>
      )}
        </TabsContent>

        {/* --- INFO --- */}
        <TabsContent value="info" className="mt-0 space-y-6">
          {store.description && (
            <div>
              <h3 className="font-headline text-lg font-bold mb-2">Sobre la tienda</h3>
              <p className="text-muted-foreground">{store.description}</p>
            </div>
          )}
          <div>
            <h3 className="font-headline text-lg font-bold mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-info" /> Dirección
            </h3>
            <p className="text-muted-foreground">{cleanAddress(store.address)}</p>
          </div>
          <div>
            <h3 className="font-headline text-lg font-bold mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Horarios
            </h3>
            {/* Semana completa: hasta ahora la página solo mostraba el horario de HOY.
                Se arma con los helpers que ya expone store-hours.ts. */}
            {(() => {
              const weekly = normalizeSchedule(store);
              if (!weekly) return <p className="text-sm text-muted-foreground">Siempre abierta.</p>;
              const todayIdx = new Date().getDay();
              return (
                <ul className="max-w-md text-sm">
                  {DISPLAY_ORDER.map(idx => {
                    const day = weekly[idx];
                    const isToday = idx === todayIdx;
                    return (
                      <li key={idx} className={cn(
                        'flex justify-between gap-4 border-b border-border/40 py-1.5',
                        isToday && 'font-semibold text-foreground',
                      )}>
                        <span className={cn(!isToday && 'text-muted-foreground')}>
                          {DAY_LABELS[idx]}{isToday && ' (hoy)'}
                        </span>
                        <span className={cn(day?.closed && 'text-muted-foreground')}>
                          {day?.closed || !day?.ranges?.length ? 'Cerrado' : formatRanges(day.ranges)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
          <Button variant="outline" onClick={handleShare} className="gap-2">
            <Share2 className="h-4 w-4" /> Compartir tienda
          </Button>
        </TabsContent>

        {/* --- RESEÑAS --- */}
        <TabsContent value="reviews" className="mt-0">
      <div id={REVIEWS_ANCHOR} className="mb-10">
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
        </TabsContent>
      </Tabs>

      {/* MÁS TIENDAS DEL MISMO RUBRO — permite saltar de tienda en tienda sin volver al
          inicio. Se oculta si no hay otras (no tiene sentido una fila de uno). */}
      {relatedStores.length > 0 && (
        <div className="mb-10 px-4 sm:px-0">
          <h2 className="font-headline text-xl font-bold mb-4 flex items-center gap-2">
            <StoreIcon className="h-5 w-5 text-primary" /> Más de {storeCategory}
          </h2>
          <div className="min-w-0">
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {relatedStores.map((s: any, i: number) => {
                // Mismo criterio que el inicio: la pausa manual se evalúa aparte del horario.
                const st = s.manuallyPaused
                  ? { isOpen: false, label: 'Pausada' }
                  : getStoreOpenStatus(normalizeSchedule(s));
                return (
                  <StoreCard
                    key={s.id}
                    store={s}
                    isFavorite={false}
                    hideFavorite
                    isOpen={st.isOpen}
                    statusLabel={st.label}
                    onToggleFavorite={() => {}}
                    variant="carousel"
                    index={i}
                    cleanAddress={cleanAddress}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>

    <ProductDetailDialog
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onAdd={handleAddToCart}
        isDisabled={!storeStatus.isOpen}
        isFavorite={!!detailProduct && favoriteProductIds.has(detailProduct.id)}
        onToggleFavorite={() => detailProduct && toggleFavoriteProduct(detailProduct)}
    />

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

function ProductCard({ product, onAdd, onOpenDetail, isFeatured, isDisabled }: { product: Product, onAdd: (p: Product) => void, onOpenDetail: (p: Product) => void, isFeatured?: boolean, isDisabled?: boolean }) {
    const outOfStock = product.stock != null && product.stock <= 0;
    return (
        <Card className={`flex flex-col overflow-hidden border hover:shadow-md transition-all ${isFeatured ? 'border-warning/30 bg-warning/5' : ''} ${(isDisabled || outOfStock) ? 'opacity-70 grayscale' : ''}`}>
            <button type="button" onClick={() => onOpenDetail(product)} className="text-left">
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
            </button>
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

function ProductRow({ product, onAdd, onOpenDetail, isDisabled }: { product: Product, onAdd: (p: Product) => void, onOpenDetail: (p: Product) => void, isDisabled?: boolean }) {
    const outOfStock = product.stock != null && product.stock <= 0;
    return (
        <div className={cn('flex items-center gap-4 py-4 border-b last:border-0', (isDisabled || outOfStock) && 'opacity-60')}>
            <button type="button" onClick={() => onOpenDetail(product)} className="flex-1 min-w-0 text-left">
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
            </button>
            <div className="relative h-20 w-20 shrink-0">
                <button type="button" onClick={() => onOpenDetail(product)} className="h-20 w-20 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                    {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                        <Package className="h-8 w-8 text-muted-foreground/50" />
                    )}
                </button>
                {!outOfStock && (
                    <div className="absolute -bottom-2 -right-2">
                        <QuantityControl product={product} onAdd={onAdd} isDisabled={isDisabled} variant="compact" maxQuantity={product.stock ?? undefined} />
                    </div>
                )}
            </div>
        </div>
    );
}

function ProductDetailDialog({ product, onClose, onAdd, isDisabled, isFavorite, onToggleFavorite }: { product: Product | null, onClose: () => void, onAdd: (p: Product) => void, isDisabled?: boolean, isFavorite?: boolean, onToggleFavorite?: () => void }) {
    const outOfStock = !!product && product.stock != null && product.stock <= 0;
    return (
        <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                {product && (
                    <>
                        <div className="relative -mx-6 -mt-6 h-56 w-[calc(100%+3rem)] bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                            {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                            ) : (
                                <Package className="h-16 w-16 text-muted-foreground/50" />
                            )}
                            {!!product.discountPercent && (
                                <span className="absolute bottom-3 left-3 bg-success text-success-foreground text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                                    -{product.discountPercent}%
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onToggleFavorite}
                                aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm shadow-sm flex items-center justify-center hover:scale-110 transition-transform"
                            >
                                <Heart className={cn('h-[18px] w-[18px]', isFavorite ? 'fill-primary text-primary' : 'text-foreground')} />
                            </button>
                        </div>
                        <DialogHeader className="text-left pt-2">
                            <DialogTitle className="text-xl">{product.name}</DialogTitle>
                            {product.description && (
                                <DialogDescription className="text-sm text-foreground/80 pt-1">
                                    {product.description}
                                </DialogDescription>
                            )}
                        </DialogHeader>
                        <div className="flex items-center justify-between">
                            <span className="flex items-baseline gap-2">
                                {!!product.discountPercent && (
                                    <span className="text-sm text-muted-foreground line-through">${product.price}</span>
                                )}
                                <span className="text-2xl font-bold text-foreground">${effectivePrice(product).toFixed(0)}</span>
                            </span>
                            {!outOfStock && product.stock != null && product.stock <= 3 && (
                                <span className="text-xs font-medium text-destructive">Quedan {product.stock}</span>
                            )}
                        </div>
                        {outOfStock ? (
                            <Button className="w-full" disabled>Sin stock</Button>
                        ) : (
                            <QuantityControl product={product} onAdd={onAdd} isDisabled={isDisabled} maxQuantity={product.stock ?? undefined} />
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
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