'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, CollectionReference } from 'firebase/firestore';
import { normalizeSchedule, getStoreOpenStatus } from '@/lib/store-hours';
import { ShoppingBag, Search, Filter, Heart, Zap, ShieldCheck, Smartphone, ArrowRight, type LucideIcon } from 'lucide-react';
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

// --- COMPONENTES DE LA LANDING PAGE (MODO INVITADO) ---

const HeroSection = () => (
  <div className="relative overflow-hidden bg-background py-20 sm:py-32">
    <div className="container mx-auto px-4 relative z-10">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-fuchsia-400 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          Tu ciudad, en la puerta de tu casa.
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground animate-in fade-in slide-in-from-bottom-5 duration-1000 delay-200">
          Pide comida, ropa, farmacia y más. Conectamos a las mejores tiendas locales contigo en minutos. Rápido, seguro y fácil.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6 animate-in fade-in zoom-in duration-1000 delay-300">
          <Link href="/login">
            <Button size="lg" className="h-12 px-8 text-lg rounded-full shadow-lg hover:shadow-primary/25 transition-all hover:scale-105">
              Comenzar Ahora <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Link href="/support" className="text-sm font-semibold leading-6 text-foreground hover:underline">
            Saber más <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
    
    {/* Fondo decorativo */}
    <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#8B5CF6] to-[#c084fc] opacity-25 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }} />
    </div>
  </div>
);

const FeaturesSection = () => (
    <div className="container mx-auto py-24 sm:py-32">
        <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary">Todo lo que necesitas</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Una experiencia de compra superior
            </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-3 lg:gap-y-16">
                <div className="relative pl-16">
                    <dt className="text-base font-semibold leading-7 text-foreground">
                        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                            <Zap className="h-6 w-6 text-primary" aria-hidden="true" />
                        </div>
                        Entregas Flash
                    </dt>
                    <dd className="mt-2 text-base leading-7 text-muted-foreground">
                        Nuestros repartidores están listos para llevar tu pedido en tiempo récord. Sigue tu envío en tiempo real.
                    </dd>
                </div>
                <div className="relative pl-16">
                    <dt className="text-base font-semibold leading-7 text-foreground">
                        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-xl bg-success/15">
                            <ShieldCheck className="h-6 w-6 text-success" aria-hidden="true" />
                        </div>
                        Pagos Seguros
                    </dt>
                    <dd className="mt-2 text-base leading-7 text-muted-foreground">
                        Paga con tranquilidad. Tu información está protegida y el dinero solo se libera cuando recibes tu pedido.
                    </dd>
                </div>
                <div className="relative pl-16">
                    <dt className="text-base font-semibold leading-7 text-foreground">
                        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-xl bg-info/15">
                            <Smartphone className="h-6 w-6 text-info" aria-hidden="true" />
                        </div>
                        Todo en tu bolsillo
                    </dt>
                    <dd className="mt-2 text-base leading-7 text-muted-foreground">
                        Gestiona tus favoritos, repite pedidos anteriores y chatea con la tienda desde cualquier lugar.
                    </dd>
                </div>
            </dl>
        </div>
    </div>
);

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
  const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'config', 'platform') : null), [firestore]);
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

  // 🟢 MODO INVITADO: LANDING PAGE
  if (!user) {
    return (
        <div className="flex flex-col min-h-screen">
            <HeroSection />
            <FeaturesSection />
            {/* Footer simple */}
            <footer className="py-6 text-center text-sm text-muted-foreground border-t space-y-2">
                <p>© 2025 EncomiendaYA. Todos los derechos reservados.</p>
                <div className="flex justify-center gap-4">
                    <Link href="/terms" className="underline hover:text-foreground">Términos y Condiciones</Link>
                    <Link href="/privacy" className="underline hover:text-foreground">Política de Privacidad</Link>
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