'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, CollectionReference } from 'firebase/firestore';
import { normalizeSchedule, getStoreOpenStatus } from '@/lib/store-hours';
import { ShoppingBag, Search, Filter, Heart, Zap, ArrowRight, type LucideIcon } from 'lucide-react';
import { StoreCard, type StoreCardStore } from '@/components/store-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getCategoryStyle, formatCategoryLabel } from '@/lib/category-style';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  maxDiscountPercent?: number;
}

// Estado de apertura para la tarjeta del listado. Misma fuente de verdad que la tienda
// pública (store-hours.ts) + el corte manual, que store-hours no conoce (igual que en
// stores/[storeId]/page.tsx la pausa se maneja aparte del horario).
const storeOpenState = (store: Store): { isOpen: boolean; label: string } => {
  if (store.manuallyPaused) return { isOpen: false, label: 'Pausada' };
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
    <h2 className="font-headline text-lg font-bold mb-3 flex items-center gap-2">
      <Icon className={cn('h-5 w-5', accent)} />
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
        <button
          key={cat}
          onClick={() => setSelectedCategory(cat)}
          aria-pressed={isActive}
          className="flex flex-col items-center gap-1.5 shrink-0 transition-transform duration-300 ease-spring"
        >
          <div className={cn(
            'h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300 ease-spring ring-2',
            isActive
              ? cn('scale-105 shadow-glow ring-offset-2 ring-offset-background', style.solid, style.ring)
              : cn('ring-transparent hover:scale-105', style.bg),
          )}>
            <Icon className={cn('h-6 w-6', isActive ? '' : style.text)} />
          </div>
          <span className={cn('text-[11px] font-medium whitespace-nowrap', isActive ? 'text-foreground' : 'text-muted-foreground')}>
            {formatCategoryLabel(cat)}
          </span>
          {counts[cat] !== undefined && (
            <span className="text-[10px] leading-none text-muted-foreground/70">{counts[cat]}</span>
          )}
        </button>
      );
    })}
  </div>
);

interface FilterBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  minRating: string;
  setMinRating: (rating: string) => void;
}

// El <Select> de categoría se sacó a propósito: duplicaba exactamente lo que hacen los
// chips de arriba. Los chips son la única fuente de verdad del rubro.
const FilterBar = ({ searchTerm, setSearchTerm, minRating, setMinRating }: FilterBarProps) => (
  <div className="flex flex-col sm:flex-row gap-3 mb-6">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Buscar una tienda..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="pl-10 w-full h-11 rounded-xl bg-card"
      />
    </div>
    <Select value={minRating} onValueChange={setMinRating}>
      <SelectTrigger className="w-full sm:w-[190px] h-11 rounded-xl bg-card">
        <Filter className="h-4 w-4 mr-2 text-primary" />
        <SelectValue placeholder="Calificación" />
      </SelectTrigger>
      <SelectContent>
        {[5, 4, 3, 2, 1, 0].map(rating => (
          <SelectItem key={rating} value={String(rating)}>
            {rating === 0 ? 'Todas las calif.' : `${rating}+ Estrellas`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

// ✅ Separamos el contenido lógico del componente principal para usar Suspense
function HomeContent() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Este hook es el que causa el error de build si no está envuelto en Suspense
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [minRating, setMinRating] = useState('0');

  useEffect(() => {
      const categoryParam = searchParams.get('category');
      if (categoryParam) {
          setSelectedCategory(categoryParam);
      }
  }, [searchParams]);

  const storesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'stores') as CollectionReference<Store>;
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

  const hasFilters = !!searchTerm || selectedCategory !== 'Todas' || minRating !== '0';

  const filteredStores = useMemo(() => {
    const minRatingValue = parseFloat(minRating);
    const list = hasFilters
      ? decorated.filter(({ store }) => {
          const matchesSearch = store.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCategory = selectedCategory === 'Todas' || store.category === selectedCategory;
          const matchesRating = (store.rating || 0) >= minRatingValue;
          return matchesSearch && matchesCategory && matchesRating;
        })
      : [...decorated];

    return list.sort((a, b) => {
      // Abiertas primero -- no tiene sentido mostrar arriba una tienda que no puede
      // recibir pedidos ahora (aunque sea favorita: no vas a poder comprarle igual).
      if (a.status.isOpen !== b.status.isOpen) return a.status.isOpen ? -1 : 1;
      if (a.isFav !== b.isFav) return a.isFav ? -1 : 1;
      return (b.store.rating || 0) - (a.store.rating || 0);
    });
  }, [decorated, hasFilters, searchTerm, selectedCategory, minRating]);

  // Secciones del modo "explorar" — todas son particiones en memoria de `decorated`,
  // cero lecturas nuevas a Firestore.
  const discountedStores = useMemo(
    () => filteredStores.filter(d => (d.store.maxDiscountPercent || 0) > 0),
    [filteredStores],
  );
  const favoriteStores = useMemo(() => filteredStores.filter(d => d.isFav), [filteredStores]);

  // Los rubros salen de las tiendas APROBADAS, no de rawStores: si no, una tienda pendiente
  // de aprobación aportaba su rubro al chip y ese chip después daba 0 resultados.
  const categories = useMemo(() => {
    const unique = new Set(decorated.map(d => d.store.category).filter(Boolean));
    return ['Todas', ...Array.from(unique).filter(c => c !== 'Todas')];
  }, [decorated]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todas: decorated.length };
    decorated.forEach(({ store }) => {
      if (store.category) counts[store.category] = (counts[store.category] || 0) + 1;
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
            toast({ description: "Agregado a favoritos ❤️" });
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
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-5 sm:p-6 mb-6">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
            <div className="absolute -left-10 -top-16 h-52 w-52 rounded-full bg-primary/25 blur-3xl animate-float" />
            <div className="absolute -right-12 -bottom-20 h-56 w-56 rounded-full bg-cat-kiosk/20 blur-3xl animate-float" style={{ animationDelay: '2.5s' }} />
          </div>
          <h1 className="font-headline text-2xl sm:text-3xl font-bold leading-tight">
            Tu ciudad, <span className="text-gradient">en la puerta de tu casa</span> 🛵
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
          minRating={minRating}
          setMinRating={setMinRating}
        />

        {/* "Con descuento" sí (es vidriera pura, cero datos personales); "Tus favoritas" no. */}
        {!hasFilters && discountedStores.length > 0 && (
          <StoreRow title="Con descuento" icon={Zap} accent="text-cat-food">
            {discountedStores.map((d, i) => renderCard(d, i, 'carousel'))}
          </StoreRow>
        )}

        <h2 className="font-headline text-xl font-bold mb-4 flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          {hasFilters ? 'Resultados' : 'Todas las tiendas'}
          <span className="text-sm font-normal text-muted-foreground ml-2">({filteredStores.length})</span>
        </h2>
        <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredStores.length === 0 ? (
            <div className="col-span-full text-center py-12 opacity-70">
              <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-lg font-medium">No encontramos tiendas</p>
              {hasFilters && (
                <Button variant="link" onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); setMinRating('0'); }} className="mt-2">
                  Limpiar Filtros
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
            <Link href="/signup/store" className="font-medium text-foreground hover:text-primary">🏪 Registrá tu tienda</Link>
            <Link href="/signup/delivery" className="font-medium text-foreground hover:text-primary">🛵 Sumate como repartidor</Link>
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
      {/* HERO — con globos difuminados detrás (decorativos, no interactivos) */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-5 sm:p-6 mb-6">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute -left-10 -top-16 h-52 w-52 rounded-full bg-primary/25 blur-3xl animate-float" />
          <div className="absolute -right-12 -bottom-20 h-56 w-56 rounded-full bg-cat-kiosk/20 blur-3xl animate-float" style={{ animationDelay: '2.5s' }} />
        </div>

        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
            <AvatarImage src={userProfile?.profileImageUrl} alt={userProfile?.displayName} />
            <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg">
              {(userProfile?.displayName || 'I').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="font-headline text-2xl sm:text-3xl font-bold leading-tight">
              Hola, <span className="text-gradient">{userProfile?.displayName || 'Invitado'}</span> 👋
            </h1>
            <p className="text-sm text-muted-foreground">¿Qué se te antoja hoy?</p>
          </div>
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
        minRating={minRating}
        setMinRating={setMinRating}
      />

      {/* Secciones destacadas — solo en modo "explorar" (sin filtros activos). Con filtros
          se muestra una única grilla de resultados, si no la página confunde. */}
      {!hasFilters && discountedStores.length > 0 && (
        <StoreRow title="Con descuento" icon={Zap} accent="text-cat-food">
          {discountedStores.map((d, i) => renderCard(d, i, 'carousel'))}
        </StoreRow>
      )}
      {!hasFilters && favoriteStores.length > 0 && (
        <StoreRow title="Tus favoritas" icon={Heart} accent="text-primary">
          {favoriteStores.map((d, i) => renderCard(d, i, 'carousel'))}
        </StoreRow>
      )}

      <h2 className="font-headline text-xl font-bold mb-4 flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-primary" />
        {hasFilters ? 'Resultados' : 'Todas las tiendas'}
        <span className="text-sm font-normal text-muted-foreground ml-2">({filteredStores.length})</span>
      </h2>

      <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredStores.length === 0 ? (
             <div className="col-span-full text-center py-12 opacity-70">
                <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-medium">No encontramos tiendas</p>
                <p className="text-sm">Intenta cambiar los filtros de búsqueda.</p>
                {/* Botón para limpiar filtros si no hay resultados */}
                {hasFilters && (
                    <Button variant="link" onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); setMinRating('0'); }} className="mt-2">
                        Limpiar Filtros
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