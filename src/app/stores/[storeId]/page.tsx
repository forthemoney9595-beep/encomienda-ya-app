'use client';

import { useParams, useRouter } from 'next/navigation';
import { money } from '@/lib/format-money';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/lib/firebase';
import { doc, collection, query, orderBy, where, limit } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardFooter, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Store as StoreIcon, MapPin, Star, Plus, Minus, Package, Clock, Info, Share2, MessageSquare, ChevronRight, ChevronLeft, Search, X, ShoppingBag, Home, Heart, BadgePercent } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { StoreImage } from '@/components/store-image';
import { StoreCard } from '@/components/store-card';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { setDoc, deleteDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { getCategoryStyle, formatCategoryLabel } from '@/lib/category-style';
import { normalizeSchedule, getStoreOpenStatus, formatRanges, DAY_LABELS, DISPLAY_ORDER, isStorePaused, pausedUntilMs, upcomingSpecialDays, formatSpecialDay, type WeeklySchedule } from '@/lib/store-hours';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StarRating } from '@/components/star-rating';
import { PricePill } from '@/components/price-pill';
import { CategoryTile } from '@/components/category-tile';
import { Garland } from '@/components/garland';
import { ImageLightbox } from '@/components/image-lightbox';
import { format } from 'date-fns';
import { fmtDate } from '@/lib/format-date';
import { es } from 'date-fns/locale';
import { publicName } from '@/lib/public-name';
import { SlidingPill, useBumpKey, useScrollActiveIntoRow, buyerMotion, DIALOG_CLOSE_BIG, DIALOG_SHELL, GlassBone } from '@/components/buyer-motion';

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
  pausedUntil?: unknown;
  maxDiscountPercent?: number;
  // Gate de aprobación (Tanda A): sin true, la tienda solo la ven dueño y admin.
  isApproved?: boolean;
  ownerId?: string;
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
  const { user, userProfile } = useAuth();
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
  // Vidrio (9/11/2026): píldoras que se deslizan en las pestañas y en la barra de categorías.
  const tabsRef = useRef<HTMLDivElement>(null);
  const catRowRef = useRef<HTMLDivElement>(null);
  useScrollActiveIntoRow(catRowRef, '[aria-current="true"]', activeCategory);
  const cartBumpKey = useBumpKey(cartStoreId === storeId ? totalItems : 0);

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
      if (isStorePaused(store)) {
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

    // 🔒 Candado de la Opción A (ago 2026): el invitado navega la vidriera libre, pero
    // para PEDIR necesita cuenta. El candado va acá (en la acción), no en la puerta —
    // recién cuando quiere agregar algo al carrito se le pide registrarse.
    if (!user) {
        toast({
            title: "Creá tu cuenta para pedir",
            description: "Es gratis y rápido. Después seguí desde donde estabas.",
            action: (
                <ToastAction altText="Crear cuenta" onClick={() => router.push('/signup/buyer')}>
                    Crear cuenta
                </ToastAction>
            ),
        });
        return;
    }

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
      { rootMargin: '-180px 0px -65% 0px', threshold: 0 },
    );
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [activeTab, searchTerm, products]);

  useEffect(() => () => window.clearTimeout(scrollSpyTimeout.current), []);

  if (storeLoading || productsLoading || legacyProductsLoading) return <LoadingSkeleton />;
  if (!store) return <StoreNotFound router={router} />;

  // 🔒 Tienda NO aprobada (Tanda A de la auditoría): la aprobación del admin solo la
  // escondía del inicio — por URL directa renderizaba completa CON carrito. Solo pueden
  // verla su dueño (para prepararla mientras espera) y el admin (para revisarla);
  // /api/orders/create la rechaza igual server-side (defensa doble).
  const isPrivilegedViewer = userProfile?.role === 'admin' || (!!user && store.ownerId === user.uid);
  if (store.isApproved !== true && !isPrivilegedViewer) {
    return (
      <div className="container mx-auto py-24 text-center space-y-4">
        <StoreIcon className="h-14 w-14 mx-auto text-muted-foreground/50" />
        <h2 className="text-xl font-bold">Esta tienda todavía no está disponible</h2>
        <p className="text-sm text-muted-foreground">Está pendiente de habilitación. Volvé a intentar más tarde.</p>
        <Button variant="outline" onClick={() => router.push('/')}>Volver al inicio</Button>
      </div>
    );
  }

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
          ...(storeCategory ? [{ label: formatCategoryLabel(storeCategory), href: `/?category=${encodeURIComponent(storeCategory)}` }] : []),
          { label: store.name },
        ]}
      />

      {/* BANNER — más bajo que antes (Rediseño 2, Tanda 0): en celular el primer producto
          aparecía recién después de una pantalla y media de cabecera. Sin velo degradé: el
          nombre ya no va encima de la foto. */}
      <div className="relative">
        <div className="relative aspect-[3.2/1] sm:aspect-[4/1] overflow-hidden rounded-card">
            <StoreImage
              src={store.imageUrl}
              name={store.name}
              category={storeCategory}
              seed={storeId}
              grayscale={!storeStatus.isOpen}
              sizes="(max-width: 640px) 100vw, 1100px"
              priority
              withName
              initialsClassName="text-4xl"
            />
        </div>
      </div>


      {/* INFO — tarjeta de vidrio que monta sobre el banner (rediseño en vidrio, 9/11/2026), con
          el cuadradito del rubro al lado del nombre (reemplaza la franja de toldo). La dirección
          y el horario de la semana viven en la pestaña Info. */}
      <Card className="glass-strong relative z-[1] mx-2 -mt-8 mb-6 space-y-2 p-4 sm:mx-6 sm:p-5">
          <Garland />
          <div className="flex items-start gap-3">
              <CategoryTile category={storeCategory} size="md" label={storeCategory ? formatCategoryLabel(storeCategory) : undefined} />
              <h1 className="min-w-0 flex-1 self-center font-headline text-4xl sm:text-5xl font-extrabold leading-none tracking-tight text-balance break-words">{store.name}</h1>
              <Button variant="outline" size="icon" onClick={handleShare} className="h-11 w-11 shrink-0" aria-label="Compartir tienda">
                  <Share2 className="h-4 w-4" />
              </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {storeCategory && (
                  <span className={cn('font-bold', getCategoryStyle(storeCategory).text)}>{formatCategoryLabel(storeCategory)}</span>
              )}
              <span className={cn('font-semibold', storeStatus.isOpen ? 'text-success' : 'text-muted-foreground')}>
                  {storeStatus.label}{storeStatus.isOpen && (store.weeklySchedule || store.schedule) && storeStatus.timeRange ? ` · ${storeStatus.timeRange}` : ''}
              </span>
              {(store.rating || 0) > 0 ? (
                  <button onClick={scrollToReviews} className="inline-flex min-h-[36px] items-center gap-1 font-semibold hover:underline underline-offset-4">
                      <Star className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                      {store.rating?.toFixed(1).replace('.', ',')}
                      <span className="font-normal text-muted-foreground">({store.ratingCount || 0})</span>
                  </button>
              ) : (
                  <span className="text-muted-foreground">Sin reseñas todavía</span>
              )}
          </div>

          {store.description && <p className="text-sm text-muted-foreground max-w-2xl line-clamp-2">{store.description}</p>}

          {/* OFERTAS en naranja (color de ofertas del sistema). Antes era texto blanco sobre
              naranja: 2,6:1, ilegible (auditoría Impeccable 9/11). Ahora fondo suave + texto
              del tema. */}
          {(store.maxDiscountPercent || 0) > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl border border-offer/40 bg-offer/10 px-3 py-2.5">
                  <BadgePercent className="h-5 w-5 shrink-0 text-offer" aria-hidden="true" />
                  <p className="text-sm font-semibold text-foreground">
                      Hasta -{store.maxDiscountPercent}% en productos marcados
                  </p>
              </div>
          )}
      </Card>

      {/* El aviso de cerrado queda FUERA de las pestañas: tiene que verse siempre. */}
      {!storeStatus.isOpen && (
          <div className="mb-8 rounded-card border border-destructive/30 bg-destructive/10 p-4 text-center text-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
              <p className="font-semibold">
                  {storeStatus.paused
                      ? (pausedUntilMs(store) ? `Este local pausó los pedidos hasta las ${fmtDate(pausedUntilMs(store), 'time')}.` : 'Este local pausó los pedidos por un rato.')
                      : 'Este local está cerrado ahora.'}
              </p>
              <p className="text-sm">
                  {storeStatus.paused
                      ? 'Puedes ver el menú, pero la tienda no está aceptando pedidos en este momento.'
                      : 'Puedes ver el menú, pero no podrás realizar pedidos hasta que abra.'}
              </p>
          </div>
      )}

      {/* PESTAÑAS — antes las reseñas quedaban al fondo de todo el scroll del menú. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Vidrio (9/11/2026): control segmentado de vidrio; la píldora de la marca se desliza
            hasta la pestaña elegida (antes, un subrayado que saltaba). */}
        <TabsList ref={tabsRef} className="glass relative mb-6 grid h-auto w-full grid-cols-3 gap-1 rounded-full p-1 sm:max-w-md">
          <SlidingPill containerRef={tabsRef} activeSelector='[data-state="active"]' activeKey={activeTab + (reviews?.length ?? 0)} className="rounded-full bg-primary shadow-sm" />
          {[
            { v: 'menu', label: 'Menú' },
            { v: 'info', label: 'Info' },
            { v: 'reviews', label: `Reseñas${reviews?.length ? ` (${reviews.length})` : ''}` },
          ].map(t => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="relative z-[1] min-h-[44px] rounded-full px-3 font-headline text-lg font-bold text-muted-foreground transition-colors duration-200 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="menu" className="mt-0">
          <div className="relative mb-6 max-w-md">
              <Search className="absolute left-4 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                  type="search"
                  aria-label={`Buscar en ${store.name}`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Buscar en ${store.name}...`}
                  className="h-12 rounded-full border-[color:var(--glass-line)] bg-[color:var(--glass-strong)] pl-11 pr-12 shadow-[var(--glass-shadow)] [backdrop-filter:blur(var(--glass-blur))_saturate(1.5)]"
              />
              {searchTerm && (
                  <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                  >
                      <X className="h-4 w-4" />
                  </button>
              )}
          </div>

      {/* NAVEGACIÓN POR CATEGORÍA — barra de vidrio pegada debajo del encabezado flotante
          (top-[4.5rem] = margen de 0,5rem + 3,5rem del encabezado + 0,5rem de aire). Si cambia
          el alto del encabezado del shell (app-content.tsx), cambiar acá y el scroll-mt. */}
      {groupedProducts.length > 1 && (
          <div className="glass-bar sticky top-[4.5rem] z-20 mb-6 rounded-full p-1.5">
              {/* Vidrio (9/11/2026): píldoras en una fila; la de la marca se desliza hasta la
                  categoría que se está mirando (scroll-spy) y la fila se corre sola para
                  dejarla a la vista. */}
              <div ref={catRowRef} role="group" aria-label="Categorías del menú" className="relative flex gap-1 overflow-x-auto no-scrollbar">
                  <SlidingPill containerRef={catRowRef} activeSelector='[aria-current="true"]' activeKey={activeCategory} className="rounded-full bg-primary" />
                  {groupedProducts.map(([category]) => {
                      const style = getCategoryStyle(category);
                      const Icon = style.icon;
                      const isActive = activeCategory === category;
                      return (
                          <button
                              key={category}
                              onClick={() => scrollToCategory(category)}
                              aria-current={isActive ? 'true' : undefined}
                              className={cn(
                                  'relative z-[1] flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200',
                                  isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                              )}
                          >
                              <Icon className={cn('h-4 w-4', isActive ? '' : style.text)} aria-hidden="true" />
                              {formatCategoryLabel(category)}
                          </button>
                      );
                  })}
              </div>
          </div>
      )}

      {/* DESTACADOS — carrusel horizontal (swipe en celular, flechas en desktop) */}
      {featuredProducts.length > 0 && (
        <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline text-xl font-bold flex items-center gap-2">
                    <Star className="h-5 w-5 text-warning fill-current" /> Recomendados
                </h2>
                <div className="hidden sm:flex gap-2">
                    <Button variant="outline" size="icon" className="glass h-10 w-10 rounded-full border-[color:var(--glass-line)] bg-[color:var(--glass)]" onClick={() => featuredApi?.scrollPrev()} disabled={!canScrollPrev} aria-label="Ver destacados anteriores">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="glass h-10 w-10 rounded-full border-[color:var(--glass-line)] bg-[color:var(--glass)]" onClick={() => featuredApi?.scrollNext()} disabled={!canScrollNext} aria-label="Ver más destacados">
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
        <div className="glass rounded-card py-12 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-muted-foreground">Sin resultados para &quot;{searchTerm}&quot;.</p>
            <Button variant="link" onClick={() => setSearchTerm('')} className="mt-1 min-h-[44px]">Limpiar búsqueda</Button>
        </div>
      ) : products.length > 0 ? (
        groupedProducts.map(([category, items]) => (
            // Separación notoria entre categorías (Fase RR sexies, pedido de la prueba):
            // barra de acento + contador + línea divisoria, y las filas dentro de un
            // contenedor propio — antes era solo un h2 suelto y el menú se leía como una
            // lista continua sin cortes.
            <div key={category} id={categorySlug(category)} data-category-section={category} className="mb-10 scroll-mt-[10rem]">
                {/* Vidrio (9/11/2026): cada categoría es UNA tarjeta de vidrio con su título
                    arriba (antes, barra degradé + caja con borde). */}
                <div className="mb-3 flex items-center gap-2.5 px-1">
                    <h2 className="font-headline text-2xl font-extrabold leading-none">{formatCategoryLabel(category)}</h2>
                    <span className="glass rounded-full px-2.5 py-0.5 text-sm font-semibold text-muted-foreground">{items.length}</span>
                </div>
                <div className="glass rounded-card px-4">
                    {items.map(product => (
                        <ProductRow key={product.id} product={product} onAdd={handleAddToCart} onOpenDetail={setDetailProduct} isDisabled={!storeStatus.isOpen} />
                    ))}
                </div>
            </div>
        ))
      ) : (
        <div className="glass rounded-card py-12 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-muted-foreground">Esta tienda aún no tiene productos disponibles.</p>
        </div>
      )}
        </TabsContent>

        {/* --- INFO --- */}
        <TabsContent value="info" className="mt-0 grid gap-4 md:grid-cols-2">
          {store.description && (
            <Card className="p-5 md:col-span-2">
              <h3 className="font-headline text-xl font-extrabold mb-2">Sobre la tienda</h3>
              <p className="text-muted-foreground">{store.description}</p>
            </Card>
          )}
          <Card className="p-5 md:self-start">
            <h3 className="font-headline text-xl font-extrabold mb-2 flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-info/10"><MapPin className="h-4 w-4 text-info" aria-hidden="true" /></span> Dirección
            </h3>
            <p className="text-muted-foreground">{cleanAddress(store.address)}</p>
          </Card>
          <Card className="p-5 md:row-span-2">
            <h3 className="font-headline text-xl font-extrabold mb-3 flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10"><Clock className="h-4 w-4 text-primary" aria-hidden="true" /></span> Horarios
            </h3>
            {/* Fechas especiales (feriados/fiestas) de los próximos 14 días, arriba de la semana. */}
            {(() => { const special = upcomingSpecialDays(store, new Date(), 14); if (special.length === 0) return null;
              return (<p data-testid="special-hours-info" className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm"><span className="font-semibold">Horario especial:</span>{' '}{special.map(formatSpecialDay).join(' · ')}</p>); })()}
            {/* Semana completa: hasta ahora la página solo mostraba el horario de HOY.
                Se arma con los helpers que ya expone store-hours.ts. Sin semanal (pero quizás
                con fechas especiales) normalizeSchedule devuelve alwaysOpen: no se listan
                siete días "00:00-24:00". */}
            {(() => {
              const weekly = normalizeSchedule(store);
              if (!weekly || weekly.alwaysOpen) return <p className="text-sm text-muted-foreground">Siempre abierta.</p>;
              const todayIdx = new Date().getDay();
              return (
                <ul className="text-sm">
                  {DISPLAY_ORDER.map(idx => {
                    const day = weekly[idx];
                    const isToday = idx === todayIdx;
                    return (
                      <li key={idx} className={cn(
                        'flex justify-between gap-4 border-b border-border/40 px-2 py-2 last:border-0',
                        isToday && 'rounded-xl border-transparent bg-primary/10 font-semibold text-foreground',
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
          </Card>
          <div className="md:col-span-1">
            <Button variant="outline" onClick={handleShare} className="glass h-12 gap-2 rounded-full border-[color:var(--glass-line)] bg-[color:var(--glass)] px-5">
              <Share2 className="h-4 w-4" /> Compartir tienda
            </Button>
          </div>
        </TabsContent>

        {/* --- RESEÑAS --- */}
        <TabsContent value="reviews" className="mt-0">
      <div id={REVIEWS_ANCHOR} className="mb-10">
          <h2 className="font-headline text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Reseñas de la tienda
          </h2>
          {(!reviews || reviews.length === 0) ? (
              <div className="glass rounded-card py-10 text-center">
                  <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
                  <p className="text-muted-foreground">Todavía no hay reseñas. Sé el primero en calificar después de tu pedido.</p>
              </div>
          ) : (
              <div className="grid gap-4 md:grid-cols-2">
                  {reviews.slice(0, 10).map((review, i) => (
                      <Card key={review.id} className="stagger-in" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
                          <CardContent className="py-4 space-y-2">
                              <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm">{publicName(review.userName)}</span>
                                  <StarRating rating={review.rating} />
                              </div>
                              {review.createdAt?.seconds && (
                                  <p className="text-xs text-muted-foreground">
                                      {format(new Date(review.createdAt.seconds * 1000), "d MMM yyyy", { locale: es })}
                                  </p>
                              )}
                              {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
                              {review.ownerReply && (
                                  <div className="mt-2 rounded-xl bg-primary/[0.07] p-3">
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
        <div className="mb-10">
          <h2 className="font-headline text-2xl font-extrabold mb-3 flex items-center gap-3">
            <CategoryTile category={storeCategory} size="sm" /> Más de {formatCategoryLabel(storeCategory ?? '')}
          </h2>
          <div className="min-w-0">
            <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-4 pt-1 no-scrollbar [&>a]:snap-start">
              {relatedStores.map((s: any, i: number) => {
                // Mismo criterio que el inicio: la pausa manual se evalúa aparte del horario.
                const st = isStorePaused(s)
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
    {/* Vidrio (9/11/2026): la barra es de vidrio (antes un bloque petróleo macizo) con la
        bolsa en un círculo de la marca que LATE cada vez que se agrega algo, y el botón
        "Ver carrito" en píldora de la marca. Entra desde abajo la primera vez. */}
    {showCartBar && (
        <button
            onClick={() => setCartSheetOpen(true)}
            data-testid="store-cart-bar"
            className={cn('glass-bar fixed inset-x-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-full py-2 pl-2 pr-2 text-foreground transition-transform active:scale-[0.98] motion-reduce:active:scale-100 bottom-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)] md:bottom-6', buyerMotion.rise)}
        >
            <span key={cartBumpKey} className={cn('relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground', cartBumpKey > 0 && buyerMotion.bump)}>
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                <span className="absolute -right-1 -top-1 grid h-6 min-w-[1.5rem] place-items-center rounded-full border-2 border-[color:var(--glass-line)] bg-offer px-1 text-xs font-extrabold text-offer-foreground tabular-nums">{totalItems}</span>
            </span>
            <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm leading-tight text-muted-foreground">{totalItems} {totalItems === 1 ? 'producto' : 'productos'}</span>
                <span className="block font-headline text-xl font-extrabold leading-tight tabular-nums">{money(totalPrice)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-primary px-4 py-2.5 font-bold text-primary-foreground">Ver carrito</span>
        </button>
    )}
    </>
  );
}

// Carga en vidrio (9/11/2026): misma silueta que la página (banner, tarjeta del local,
// pestañas y una categoría) para que nada salte al llegar los datos.
function LoadingSkeleton() {
    return (
      <div className="container mx-auto space-y-6 py-4" aria-busy="true" aria-label="Cargando la tienda">
        <GlassBone className="aspect-[3.2/1] w-full rounded-card sm:aspect-[4/1]" />
        <Card className="mx-2 -mt-12 space-y-3 p-4 sm:mx-6">
            <div className="flex items-center gap-3">
                <GlassBone className="h-[3.125rem] w-[3.125rem] rounded-[1rem]" />
                <GlassBone className="h-9 w-2/3" />
            </div>
            <GlassBone className="h-4 w-1/2" />
        </Card>
        <GlassBone className="h-12 w-full rounded-full sm:max-w-md" />
        <Card className="space-y-4 p-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 space-y-2"><GlassBone className="h-5 w-2/3" /><GlassBone className="h-4 w-1/2" /><GlassBone className="h-7 w-20 rounded-full" /></div>
                    <GlassBone className="h-24 w-24 rounded-2xl" />
                </div>
            ))}
        </Card>
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
        <Card className="flex h-full flex-col overflow-hidden">
            <button type="button" onClick={() => onOpenDetail(product)} data-testid="product-open-detail" className="text-left">
                <div className={`relative h-40 w-full bg-foreground/[0.05] flex items-center justify-center overflow-hidden ${(isDisabled || outOfStock) ? 'opacity-50 grayscale' : ''}`}>
                    {product.imageUrl ? (
                        <img loading="lazy" decoding="async" src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                        <Package className="h-10 w-10 text-muted-foreground/50" />
                    )}
                    {isFeatured && (
                        <span className="glass-strong absolute top-2 right-2 rounded-full px-2.5 py-1 text-xs font-bold">
                            Popular
                        </span>
                    )}
                    {!outOfStock && product.stock != null && product.stock <= 3 && (
                        <span className="absolute top-2 left-2 bg-warning text-warning-foreground text-xs font-bold px-2 py-1 rounded-full">
                            Quedan {product.stock}
                        </span>
                    )}
                    {/* Descuento en el naranja de OFERTAS con texto oscuro (se lee en los dos temas;
                        el degradé violeta con texto blanco daba 3,9:1). El verde queda para éxito. */}
                    {!!product.discountPercent && (
                        <span className="absolute bottom-2 left-2 bg-offer text-offer-foreground text-xs font-bold px-2 py-1 rounded-full">
                            -{product.discountPercent}%
                        </span>
                    )}
                </div>
                <CardHeader className="p-4 pb-0">
                    <div className="flex justify-between items-start gap-2">
                        <CardTitle className="font-headline text-xl font-extrabold leading-tight line-clamp-1">{product.name}</CardTitle>
                        <span className="flex flex-col items-end gap-1 shrink-0">
                            <PricePill value={effectivePrice(product)} offer={!!product.discountPercent} className="text-base" />
                            {!!product.discountPercent && (
                                <span className="text-xs text-muted-foreground line-through">{money(product.price)}</span>
                            )}
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1 min-h-[2.5rem]">{product.description}</p>
                </CardHeader>
            </button>
            <CardFooter className="p-4 mt-auto">
                {outOfStock ? (
                    <Button className="h-11 w-full rounded-full" disabled>Sin stock</Button>
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
        // Rediseño 2 (Toldo): precio en etiqueta de góndola. Antes TODA la fila se atenuaba
        // (opacity-60) cuando no había stock y el texto quedaba en 2,5-3,4:1: ahora solo se
        // apaga la foto y el aviso se lee. "Quedan N" va en ámbar (aviso), no en rojo (error).
        <div className="flex items-center gap-4 py-4 border-b border-border/60 last:border-0">
            <button type="button" onClick={() => onOpenDetail(product)} data-testid="product-open-detail" className="flex-1 min-w-0 text-left">
                <h3 className="font-headline text-xl font-bold leading-tight line-clamp-1">{product.name}</h3>
                {product.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-2">
                    <PricePill value={effectivePrice(product)} offer={!!product.discountPercent} className="text-lg" />
                    {!!product.discountPercent && (
                        <span className="text-sm text-muted-foreground line-through">{money(product.price)}</span>
                    )}
                </p>
                {outOfStock ? (
                    <p className="text-sm font-semibold text-muted-foreground mt-1">Sin stock por hoy</p>
                ) : product.stock != null && product.stock <= 3 ? (
                    <p className="text-sm font-semibold text-warning mt-1">Quedan {product.stock}</p>
                ) : null}
            </button>
            <div className="relative h-24 w-24 shrink-0">
                <button type="button" onClick={() => onOpenDetail(product)} aria-label={`Ver ${product.name}`} className={cn('h-24 w-24 rounded-2xl bg-foreground/[0.05] overflow-hidden flex items-center justify-center', (isDisabled || outOfStock) && 'opacity-50 grayscale')}>
                    {product.imageUrl ? (
                        <img loading="lazy" decoding="async" src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
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
    // Visor de imagen completa (Fase RR sexies): la cabecera recorta con object-cover;
    // tocar la foto la muestra ENTERA sin recortes.
    const [showFullImage, setShowFullImage] = useState(false);
    return (
        <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn('flex max-h-[92vh] max-w-md flex-col gap-0 overflow-hidden p-0', DIALOG_SHELL, DIALOG_CLOSE_BIG)}>
                {product && (
                    <>
                        {/* object-CONTAIN a propósito (pedido de la prueba: "que las imágenes
                            se vean completas"): acá se ve la foto ENTERA sin recortes; el
                            click la agranda a pantalla casi completa (ImageLightbox). */}
                        <div className="relative h-64 w-full shrink-0 bg-foreground/[0.05] flex items-center justify-center overflow-hidden">
                            {product.imageUrl ? (
                                <img
                                    loading="lazy"
                                    decoding="async"
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="h-full w-full object-contain cursor-zoom-in"
                                    title="Ver imagen completa"
                                    onClick={() => setShowFullImage(true)}
                                />
                            ) : (
                                <Package className="h-16 w-16 text-muted-foreground/50" />
                            )}
                            {!!product.discountPercent && (
                                // Naranja de OFERTAS (antes verde: verde NUNCA para descuentos).
                                <span className="absolute bottom-3 left-3 rounded-full bg-offer px-2.5 py-1 text-sm font-extrabold text-offer-foreground shadow-sm">
                                    −{product.discountPercent}%
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onToggleFavorite}
                                aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                className="glass-strong absolute left-3 top-3 grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100"
                            >
                                <Heart className={cn('h-[18px] w-[18px]', isFavorite ? 'fill-primary text-primary' : 'text-foreground')} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-5">
                        <DialogHeader className="text-left">
                            <DialogTitle className="font-headline text-3xl font-extrabold leading-none">{product.name}</DialogTitle>
                            {product.description && (
                                <DialogDescription className="text-sm text-foreground/80 pt-1">
                                    {product.description}
                                </DialogDescription>
                            )}
                        </DialogHeader>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <PricePill value={effectivePrice(product)} offer={!!product.discountPercent} className="text-2xl" />
                                {!!product.discountPercent && (
                                    <span className="text-sm text-muted-foreground line-through">{money(product.price)}</span>
                                )}
                            </span>
                            {!outOfStock && product.stock != null && product.stock <= 3 && (
                                <span className="text-sm font-semibold text-warning">Quedan {product.stock}</span>
                            )}
                        </div>
                        </div>
                        {/* Pie fijo con la acción: siempre a la vista aunque la descripción sea larga. */}
                        <div className="shrink-0 border-t border-border/60 bg-popover px-6 py-4">
                        {outOfStock ? (
                            <Button className="h-12 w-full rounded-full" disabled>Sin stock</Button>
                        ) : (
                            <QuantityControl product={product} onAdd={onAdd} isDisabled={isDisabled} maxQuantity={product.stock ?? undefined} size="lg" />
                        )}
                        </div>
                        <ImageLightbox
                            src={showFullImage ? product.imageUrl || null : null}
                            alt={product.name}
                            onClose={() => setShowFullImage(false)}
                        />
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Botón "Agregar" / píldora de cantidad — refleja si el producto ya está en el carrito
// (antes "Agregar" no cambiaba nunca, sin importar cuántas unidades ya tuvieras en el carrito).
function QuantityControl({ product, onAdd, isDisabled, variant = 'full', maxQuantity, size = 'md' }: { product: Product, onAdd: (p: Product) => void, isDisabled?: boolean, variant?: 'full' | 'compact', maxQuantity?: number, size?: 'md' | 'lg' }) {
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
                    aria-label={`Agregar ${product.name}`}
                    data-testid="add-product" className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-[color:var(--glass-line)] transition-transform active:scale-90 disabled:opacity-50 motion-reduce:active:scale-100"
                >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                </button>
            );
        }
        return (
            <div className="flex h-11 items-center gap-0.5 rounded-full bg-primary px-0.5 text-primary-foreground shadow-md ring-4 ring-[color:var(--glass-line)] motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-200">
                <button onClick={dec} disabled={isDisabled} aria-label={`Quitar uno de ${product.name}`} className="flex h-10 w-9 items-center justify-center rounded-full"><Minus className="h-4 w-4" /></button>
                <span key={quantity} className={cn('w-4 text-center font-headline text-base font-extrabold tabular-nums', buyerMotion.tick)}>{quantity}</span>
                <button onClick={inc} disabled={isDisabled || atMax} aria-label={`Agregar uno de ${product.name}`} className="flex h-10 w-9 items-center justify-center rounded-full disabled:opacity-50"><Plus className="h-4 w-4" /></button>
            </div>
        );
    }

    if (quantity === 0) {
        return (
            <Button onClick={() => onAdd(product)} className={cn('w-full rounded-full', size === 'lg' ? 'h-12 text-lg' : 'h-11')} disabled={isDisabled}>
                {isDisabled ? 'Cerrado' : <><Plus className="h-4 w-4 mr-1" /> Agregar</>}
            </Button>
        );
    }
    return (
        <div className={cn('flex w-full items-center justify-between rounded-full border border-primary/30 bg-primary/10 p-0.5', size === 'lg' ? 'h-12' : 'h-11')}>
            <button onClick={dec} disabled={isDisabled} aria-label={`Quitar uno de ${product.name}`} className="grid h-10 w-11 place-items-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50"><Minus className="h-4 w-4" /></button>
            <span className="text-sm font-bold text-foreground"><span key={quantity} className={buyerMotion.tick}>{quantity}</span> en el carrito</span>
            <button onClick={inc} disabled={isDisabled || atMax} aria-label={`Agregar uno de ${product.name}`} className="grid h-10 w-11 place-items-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </div>
    );
}