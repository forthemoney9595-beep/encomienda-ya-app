'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, CollectionReference, query, where } from 'firebase/firestore';
import { normalizeSchedule, getStoreOpenStatus, isStorePaused } from '@/lib/store-hours';
import { ShoppingBag, Search, Heart, Zap, ArrowRight, type LucideIcon } from 'lucide-react';
import { StoreCard, type StoreCardStore } from '@/components/store-card';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { getCategoryStyle, formatCategoryLabel } from '@/lib/category-style';
import { Input } from '@/components/ui/input';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Awning } from '@/components/awning';
import { TextTag } from '@/components/price-tag';

// --- TIPOS ---
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

// Estado de apertura para la tarjeta del listado. Misma fuente de verdad que la tienda
// pública (store-hours.ts) + el corte manual, que store-hours no conoce (igual que en
// stores/[storeId]/page.tsx la pausa se maneja aparte del horario).
const storeOpenState = (store: Store): { isOpen: boolean; label: string } => {
  // Pausa EFECTIVA (Fase YY): una pausa de 30 min/1 h vencida ya no cuenta.
  if (isStorePaused(store)) return { isOpen: false, label: 'Pausada' };
  const s = getStoreOpenStatus(normalizeSchedule(store));
  return { isOpen: s.isOpen, label: s.label };
};

// --- FUNCIÓN DE LIMPIEZA VISUAL (NUEVO) ---
const cleanAddress = (rawAddress: string | undefined) => {
    if (!rawAddress) return 'Ubicación no disponible';
    if (rawAddress.includes('Ubicación GPS') || rawAddress.includes('lat:') || rawAddress.includes('(-28.')) {
        return 'Ver ubicación en mapa'; // Texto amigable si es coordenada fea
    }
    return rawAddress;
};

// Opción A (ago 2026): la landing pura de invitado (HeroSection + FeaturesSection) se
// eliminó — el invitado ahora ve la vidriera de tiendas real (ver rama `!user` abajo).

// --- COMPONENTES DE LA APP (MODO USUARIO) ---

// Fila horizontal desplazable para las secciones destacadas del inicio.
const StoreRow = ({
  title, icon: Icon, accent, children,
}: { title: string; icon: LucideIcon; accent: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="font-headline text-2xl font-extrabold mb-3 flex items-center gap-2 border-b-2 border-foreground pb-1">
      <Icon className={cn('h-5 w-5', accent)} aria-hidden="true" />
      {title}
    </h2>
    {/* min-w-0 obligatorio: sin esto el contenido ancho de la fila estira toda la página
        (es el bug de overflow horizontal ya documentado en CLAUDE.md). */}
    <div className="min-w-0">
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">{children}</div>
    </div>
  </section>
);

interface CategoryChipsProps {
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  counts: Record<string, number>;
}

const CategoryChips = ({ categories, selectedCategory, setSelectedCategory, counts }: CategoryChipsProps) => (
  <div role="group" aria-label="Filtrar por rubro" className="flex gap-3 overflow-x-auto pb-2 mb-6 no-scrollbar">
    {categories.map((cat) => {
      const style = getCategoryStyle(cat);
      const Icon = style.icon;
      const isActive = selectedCategory === cat;
      return (
        // Rediseño 2 (Toldo): cada rubro es una baldosa con el toldo de su color arriba, como
        // la fachada de un negocio. La activa lleva la marca abajo (no un anillo con brillo).
        <button
          key={cat}
          onClick={() => setSelectedCategory(cat)}
          aria-pressed={isActive}
          className={cn(
            'w-[5.5rem] shrink-0 overflow-hidden rounded-lg border-2 border-foreground pb-2 text-center transition-colors',
            isActive ? 'bg-primary/10 shadow-[inset_0_-4px_0_hsl(var(--primary))]' : 'bg-card',
          )}
        >
          <Awning category={cat === 'Todas' ? 'todas' : cat} className="mb-3 h-5" />
          <Icon className={cn('mx-auto h-7 w-7', style.text)} aria-hidden="true" />
          <span className="mt-1 block px-1 font-headline text-base font-bold leading-tight">
            {formatCategoryLabel(cat)}
          </span>
          {counts[cat] !== undefined && (
            <span className="block text-sm leading-none text-muted-foreground">{counts[cat]}</span>
          )}
        </button>
      );
    })}
  </div>
);

interface FilterBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

// UN solo buscador en el inicio (Rediseño 2, Tanda 0). Se fueron el <Select> de categoría
// (duplicaba los chips) y el de calificación ("Todas las calif.": con pocas tiendas no
// filtraba nada útil y sumaba una barra más). En el inicio el buscador global del
// encabezado no se muestra, para no tener dos buscadores apilados.
const FilterBar = ({ searchTerm, setSearchTerm }: FilterBarProps) => (
  <div className="relative mb-6">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
    <Input
      type="search"
      aria-label="Buscar una tienda"
      placeholder="Buscar una tienda..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="pl-10 w-full h-12 rounded-xl bg-card"
    />
  </div>
);

// Primer nombre con mayúscula inicial: el perfil a veces guarda "david" y el saludo decía
// "Hola, david".
function firstName(full?: string | null): string {
  const first = (full || '').trim().split(/\s+/)[0];
  if (!first) return ''; // sin nombre: el saludo usa otra frase
  return first.charAt(0).toLocaleUpperCase('es-AR') + first.slice(1);
}

// "Comida" y "Comida rápida" eran dos chips para lo mismo. El chip agrupa por esta clave;
// el rubro guardado en cada tienda no cambia.
function chipKey(category?: string): string {
  if (!category) return '';
  const n = category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return n.includes('comida') ? 'comida' : category;
}

// Banner de promos ROTATIVO (slider, pedido de David 19/8): recorre todas las tiendas
// con descuento activo cada 5s, la mejor oferta primero, y se puede ARRASTRAR con el
// dedo o el mouse (embla, el mismo carrusel de la tienda pública — v2 a pedido) además
// de los puntitos. Con una sola oferta queda fijo. Cero lecturas extra: todo sale de
// maxDiscountPercent ya cargado. Anotado a futuro: este espacio puede venderse como
// publicidad (tienda destacada paga) — hoy el orden es solo por % de descuento.
function PromoSlider({ offers }: { offers: { id: string; name: string; maxDiscountPercent?: number }[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => { api.off('select', onSelect); };
  }, [api]);

  // Autoplay: 5s completos desde CUALQUIER cambio (automático, puntito o arrastre) —
  // el efecto depende del índice, así el timer se reinicia solo.
  useEffect(() => {
    if (!api || offers.length <= 1) return;
    const t = setTimeout(() => api.scrollNext(), 5000);
    return () => clearTimeout(t);
  }, [api, index, offers.length]);

  if (offers.length === 0) return null;

  const slide = (offer: (typeof offers)[number]) => (
    <Link href={`/stores/${offer.id}`} className="block" draggable={false}>
      {/* Naranja de OFERTAS con texto oscuro: el blanco sobre este naranja daba 2,2-2,6:1
          (auditoría Impeccable 9/11). El oscuro se lee en los dos temas. */}
      <div className="flex items-center gap-4 rounded-lg border-2 border-foreground bg-card px-3 py-3">
        <TextTag offer className="text-4xl">−{offer.maxDiscountPercent}%</TextTag>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 font-headline text-xl font-extrabold">En {offer.name}</p>
          <p className="text-sm text-muted-foreground">Ofertas de hoy · tocá para verlas</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
      </div>
    </Link>
  );

  if (offers.length === 1) return <div className="mb-6">{slide(offers[0])}</div>;

  return (
    <div className="mb-6">
      <Carousel setApi={setApi} opts={{ loop: true }}>
        <CarouselContent>
          {offers.map(o => (
            <CarouselItem key={o.id}>{slide(o)}</CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="mt-2 flex justify-center gap-1.5">
        {offers.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => api?.scrollTo(i)}
            aria-label={`Ver oferta ${i + 1} de ${offers.length}`}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === index ? 'w-5 bg-offer' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ✅ Separamos el contenido lógico del componente principal para usar Suspense
function HomeContent() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Este hook es el que causa el error de build si no está envuelto en Suspense
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  useEffect(() => {
      const categoryParam = searchParams.get('category');
      if (categoryParam) {
          setSelectedCategory(chipKey(categoryParam));
      }
  }, [searchParams]);

  const storesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // PERF-007: antes bajaba la colección ENTERA y filtraba en memoria.
    return query(collection(firestore, 'stores'), where('isApproved', '==', true)) as unknown as CollectionReference<Store>;
  }, [firestore]);

  const { data: rawStores, isLoading: storesLoading } = useCollection<Store>(storesQuery);

  // Fee de envío configurable (Fase N) — antes estaba hardcodeado "$2000" en la tarjeta.
  // 🔒 `config/platform` exige estar logueado (read: if isSignedIn()) y contiene datos
  // internos (comisión, día de liquidación). El INVITADO (Opción A) no lo lee — usa el
  // fallback de abajo, que para la vidriera alcanza (el envío es orientativo hasta pedir).
  const configRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'config', 'platform') : null), [firestore, user]);
  const { data: platformConfig } = useDoc<{ deliveryFee?: number; deliveryFeePerKm?: number }>(configRef);
  const deliveryFee = platformConfig?.deliveryFee ?? 2000;
  // Con tarifa por km activa, el envío del listado es "desde $X" (el real depende del pin).
  const variableDelivery = (platformConfig?.deliveryFeePerKm ?? 0) > 0;

  const favoritesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'favorites');
  }, [firestore, user]);

  const { data: favoritesData } = useCollection<{id: string}>(favoritesQuery);
  const favoriteIds = useMemo(() => new Set(favoritesData?.map(f => f.id)), [favoritesData]);

  // Tiendas aprobadas + su estado de apertura calculado UNA sola vez. Antes
  // storeOpenState() se llamaba dentro del comparador del sort (O(n log n) llamadas, cada
  // una re-normalizando el horario); con secciones se llamaría todavía más.
  const decorated = useMemo(() => {
    return (rawStores || [])
      .filter(store => store.isApproved !== false)
      .map(store => ({ store, status: storeOpenState(store), isFav: favoriteIds.has(store.id) }));
  }, [rawStores, favoriteIds]);

  const hasFilters = !!searchTerm || selectedCategory !== 'Todas';

  const filteredStores = useMemo(() => {
    const list = hasFilters
      ? decorated.filter(({ store }) => {
          const matchesSearch = store.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCategory = selectedCategory === 'Todas' || chipKey(store.category) === selectedCategory;
          return matchesSearch && matchesCategory;
        })
      : [...decorated];

    return list.sort((a, b) => {
      // Abiertas primero -- no tiene sentido mostrar arriba una tienda que no puede
      // recibir pedidos ahora (aunque sea favorita: no vas a poder comprarle igual).
      if (a.status.isOpen !== b.status.isOpen) return a.status.isOpen ? -1 : 1;
      if (a.isFav !== b.isFav) return a.isFav ? -1 : 1;
      return (b.store.rating || 0) - (a.store.rating || 0);
    });
  }, [decorated, hasFilters, searchTerm, selectedCategory]);

  // Secciones del modo "explorar" — todas son particiones en memoria de `decorated`,
  // cero lecturas nuevas a Firestore.
  const discountedStores = useMemo(
    () => filteredStores.filter(d => (d.store.maxDiscountPercent || 0) > 0),
    [filteredStores],
  );
  const favoriteStores = useMemo(() => filteredStores.filter(d => d.isFav), [filteredStores]);

  // Ofertas para el banner rotativo (Rediseño 19/8 + slider a pedido de David): TODAS
  // las tiendas con descuento activo, la mejor primero. Naranja intenso = color de
  // OFERTAS; sale de maxDiscountPercent (denormalizado, 0 lecturas extra).
  const promoOffers = useMemo(
    () => [...discountedStores]
      .sort((a, b) => (b.store.maxDiscountPercent || 0) - (a.store.maxDiscountPercent || 0))
      .map(d => ({ id: d.store.id, name: d.store.name, maxDiscountPercent: d.store.maxDiscountPercent })),
    [discountedStores],
  );

  // Los rubros salen de las tiendas APROBADAS, no de rawStores: si no, una tienda pendiente
  // de aprobación aportaba su rubro al chip y ese chip después daba 0 resultados.
  const categories = useMemo(() => {
    const unique = new Set(decorated.map(d => chipKey(d.store.category)).filter(Boolean));
    return ['Todas', ...Array.from(unique).filter(c => c !== 'Todas')];
  }, [decorated]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todas: decorated.length };
    decorated.forEach(({ store }) => {
      const k = chipKey(store.category);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [decorated]);

  const toggleFavorite = async (e: React.MouseEvent, store: StoreCardStore) => {
    e.preventDefault(); 
    e.stopPropagation();
    if (!user || !firestore) {
        toast({ title: "Inicia sesión", description: "Debes estar logueado para guardar favoritos." });
        return;
    }
    const isFav = favoriteIds.has(store.id);
    const docRef = doc(firestore, 'users', user.uid, 'favorites', store.id);
    try {
        if (isFav) {
            await deleteDoc(docRef);
        } else {
            await setDoc(docRef, { 
                id: store.id, 
                name: store.name,
                imageUrl: store.imageUrl || '', 
                category: store.category,
                address: store.address,
                addedAt: new Date() 
            });
            toast({ description: "Guardada en tus favoritas." });
        }
    } catch (error) {
        console.error("Error fav:", error);
    }
  };

  // ESTADO DE CARGA INICIAL
  if (authLoading) {
    return (
      <div className="container mx-auto space-y-6 py-6">
         <div className="h-96 flex items-center justify-center"><StoreCardSkeleton /></div>
      </div>
    );
  }

  // Derivados usados por AMBAS ramas (invitado y usuario) — definidos antes de los
  // returns para que la rama de invitado también los tenga.
  const openCount = decorated.filter(d => d.status.isOpen).length;
  const renderCard = (d: typeof decorated[number], i: number, variant: 'grid' | 'carousel' = 'grid') => (
    <StoreCard
      key={d.store.id}
      store={d.store}
      isFavorite={d.isFav}
      isOpen={d.status.isOpen}
      statusLabel={d.status.label}
      deliveryFee={deliveryFee}
      deliveryFeeFrom={variableDelivery}
      onToggleFavorite={toggleFavorite}
      variant={variant}
      index={i}
      cleanAddress={cleanAddress}
    />
  );

  // Se muestra en las dos vistas (usuario e invitado): es vidriera pura, sin datos
  // personales — y para el invitado es el mejor motivo para registrarse.
  const promoBanner = !hasFilters ? <PromoSlider offers={promoOffers} /> : null;

  // 🟢 MODO INVITADO: vidriera abierta (Opción A, ago 2026). El visitante ve la MISMA
  // grilla de tiendas que un usuario, navega libre y recién al querer pedir se le pide
  // cuenta (candado en el carrito de la tienda pública). Sin secciones personales
  // ("Tus favoritas") ni saludo con nombre — eso es del modo usuario.
  if (!user) {
    if (storesLoading) {
      return (
        <div className="container mx-auto space-y-6 py-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <StoreCardSkeleton key={i} />)}
          </div>
        </div>
      );
    }
    return (
      <div className="container mx-auto animate-in fade-in duration-500 pt-4">
        {/* Bienvenida compacta con CTA de registro (no el hero gigante de antes) */}
        <div className="mb-6">
          <h1 className="font-headline text-4xl sm:text-5xl font-extrabold leading-none tracking-tight text-balance">
            Lo de tu barrio, en la puerta de tu casa
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mirá las tiendas de Tinogasta. Creá tu cuenta gratis cuando quieras pedir.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/signup/buyer">
              <Button size="sm" className="rounded-full h-9 px-5 shadow-md">
                Crear cuenta <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Ya tengo cuenta →
            </Link>
            <span className="ml-auto text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <strong className="text-foreground">{openCount}</strong> abiertas ahora
            </span>
          </div>
        </div>

        <CategoryChips
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          counts={categoryCounts}
        />
        <FilterBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />

        {promoBanner}

        {/* "Con descuento" sí (es vidriera pura, cero datos personales); "Tus favoritas" no. */}
        {!hasFilters && discountedStores.length > 0 && (
          <StoreRow title="Con descuento" icon={Zap} accent="text-offer">
            {discountedStores.map((d, i) => renderCard(d, i, 'carousel'))}
          </StoreRow>
        )}

        <h2 className="font-headline text-2xl font-extrabold mb-1 flex items-baseline gap-2 border-b-2 border-foreground pb-1">
          <ShoppingBag className="h-5 w-5 self-center text-primary" aria-hidden="true" />
          {hasFilters ? 'Resultados' : 'Los de la cuadra'}
          <span className="ml-auto font-body text-sm font-normal text-muted-foreground">{filteredStores.length} {filteredStores.length === 1 ? 'tienda' : 'tiendas'}</span>
        </h2>
        <div className="grid gap-0 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredStores.length === 0 ? (
            <div className="col-span-full text-center py-12 opacity-70">
              <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-lg font-medium">No encontramos tiendas</p>
              {hasFilters && (
                <Button variant="link" onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); }} className="mt-2">
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            filteredStores.map((d, i) => renderCard(d, i))
          )}
        </div>

        <footer className="py-8 mt-6 text-center text-xs text-muted-foreground border-t space-y-3">
          {/* Puertas de NEGOCIO (captación de oferta): un marketplace vive de sus tiendas */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link href="/signup/store" className="font-medium text-foreground hover:text-primary">Registrá tu tienda</Link>
            <Link href="/signup/delivery" className="font-medium text-foreground hover:text-primary">Sumate como repartidor</Link>
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/terms" className="underline hover:text-foreground">Términos</Link>
            <Link href="/privacy" className="underline hover:text-foreground">Privacidad</Link>
            <Link href="/support" className="underline hover:text-foreground">Soporte</Link>
          </div>
        </footer>
      </div>
    );
  }

  // 🟢 MODO USUARIO: DASHBOARD DE TIENDAS
  if (storesLoading) {
    return (
      <div className="container mx-auto space-y-6 py-6">
        <PageHeader title="Cargando..." description="" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <StoreCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto animate-in fade-in duration-500">
      {/* SALUDO — sin globos difuminados, sin degradé en el nombre y sin emoji
          (Rediseño 2, Tanda 0: eran las tres señas de "hecho con IA" más visibles). */}
      <div className="mb-6">
        <div className="min-w-0">
          <h1 className="font-headline text-4xl sm:text-5xl font-extrabold leading-none tracking-tight text-balance">
            {firstName(userProfile?.displayName || userProfile?.name)
              ? `¿Qué te traemos, ${firstName(userProfile?.displayName || userProfile?.name)}?`
              : '¿Qué te traemos hoy?'}
          </h1>
        </div>

        {/* Mini-stats: todo derivado del array ya cargado, cero lecturas extra */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{decorated.length}</strong> tiendas</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <strong className="text-foreground">{openCount}</strong> abiertas ahora
          </span>
          {discountedStores.length > 0 && (
            <span><strong className="text-foreground">{discountedStores.length}</strong> con descuento</span>
          )}
        </div>
      </div>

      <CategoryChips
        categories={categories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        counts={categoryCounts}
      />

      <FilterBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />

      {promoBanner}

      {/* Secciones destacadas — solo en modo "explorar" (sin filtros activos). Con filtros
          se muestra una única grilla de resultados, si no la página confunde. */}
      {!hasFilters && discountedStores.length > 0 && (
        <StoreRow title="Con descuento" icon={Zap} accent="text-offer">
          {discountedStores.map((d, i) => renderCard(d, i, 'carousel'))}
        </StoreRow>
      )}
      {!hasFilters && favoriteStores.length > 0 && (
        <StoreRow title="Tus favoritas" icon={Heart} accent="text-primary">
          {favoriteStores.map((d, i) => renderCard(d, i, 'carousel'))}
        </StoreRow>
      )}

      <h2 className="font-headline text-2xl font-extrabold mb-1 flex items-baseline gap-2 border-b-2 border-foreground pb-1">
        <ShoppingBag className="h-5 w-5 self-center text-primary" aria-hidden="true" />
        {hasFilters ? 'Resultados' : 'Los de la cuadra'}
        <span className="ml-auto font-body text-sm font-normal text-muted-foreground">{filteredStores.length} {filteredStores.length === 1 ? 'tienda' : 'tiendas'}</span>
      </h2>

      <div className="grid gap-0 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredStores.length === 0 ? (
             <div className="col-span-full text-center py-12 opacity-70">
                <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-medium">No encontramos tiendas</p>
                <p className="text-sm">Probá con otra palabra o sacá el filtro de rubro.</p>
                {hasFilters && (
                    <Button variant="link" onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); }} className="mt-2">
                        Limpiar filtros
                    </Button>
                )}
            </div>
        ) : (
            filteredStores.map((d, i) => renderCard(d, i))
        )}
      </div>
    </div>
  );
}

// ✅ COMPONENTE PRINCIPAL (WRAPPER CON SUSPENSE)
export default function Home() {
  return (
    <Suspense fallback={
        <div className="container mx-auto space-y-6 py-6">
            <div className="h-96 flex items-center justify-center"><StoreCardSkeleton /></div>
        </div>
    }>
      <HomeContent />
    </Suspense>
  );
}