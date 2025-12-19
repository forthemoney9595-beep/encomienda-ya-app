'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, CollectionReference } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, ShoppingBag, Search, Filter, Heart, MapPin, Clock, Store as StoreIcon, Zap, ShieldCheck, Smartphone, ArrowRight } from 'lucide-react'; 
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Rating } from '@/components/ui/rating';
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
}

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
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600 animate-in fade-in slide-in-from-bottom-4 duration-1000">
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
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }} />
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
                        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                            <Zap className="h-6 w-6 text-white" aria-hidden="true" />
                        </div>
                        Entregas Flash
                    </dt>
                    <dd className="mt-2 text-base leading-7 text-muted-foreground">
                        Nuestros repartidores están listos para llevar tu pedido en tiempo récord. Sigue tu envío en tiempo real.
                    </dd>
                </div>
                <div className="relative pl-16">
                    <dt className="text-base font-semibold leading-7 text-foreground">
                        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                            <ShieldCheck className="h-6 w-6 text-white" aria-hidden="true" />
                        </div>
                        Pagos Seguros
                    </dt>
                    <dd className="mt-2 text-base leading-7 text-muted-foreground">
                        Paga con tranquilidad. Tu información está protegida y el dinero solo se libera cuando recibes tu pedido.
                    </dd>
                </div>
                <div className="relative pl-16">
                    <dt className="text-base font-semibold leading-7 text-foreground">
                        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                            <Smartphone className="h-6 w-6 text-white" aria-hidden="true" />
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

interface FilterBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  minRating: string;
  setMinRating: (rating: string) => void;
  categories: string[];
}

const FilterBar = ({
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  minRating,
  setMinRating,
  categories,
}: FilterBarProps) => (
  <Card className="p-4 mb-6 shadow-sm border-muted-foreground/20">
    <div className="flex flex-col md:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="¿Qué se te antoja hoy?"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 w-full bg-background"
        />
      </div>
      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
        <SelectTrigger className="w-full md:w-[200px]">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          {categories.map(cat => (
            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={minRating} onValueChange={setMinRating}>
        <SelectTrigger className="w-full md:w-[180px]">
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
  </Card>
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

  const favoritesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'favorites');
  }, [firestore, user]);

  const { data: favoritesData } = useCollection<{id: string}>(favoritesQuery);
  const favoriteIds = useMemo(() => new Set(favoritesData?.map(f => f.id)), [favoritesData]);

  const filteredStores = useMemo(() => {
    if (!rawStores) return [];
    let filtered = rawStores;
    const minRatingValue = parseFloat(minRating);

    filtered = filtered.filter(store => store.isApproved !== false);

    if (searchTerm || selectedCategory !== 'Todas' || minRatingValue > 0) {
      filtered = filtered.filter(store => {
        const rating = store.rating || 0; 
        const matchesSearch = store.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'Todas' || store.category === selectedCategory;
        const matchesRating = rating >= minRatingValue;
        return matchesSearch && matchesCategory && matchesRating;
      });
    }
    
    return filtered.sort((a, b) => {
        const aFav = favoriteIds.has(a.id) ? 1 : 0;
        const bFav = favoriteIds.has(b.id) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav; 
        return (b.rating || 0) - (a.rating || 0);
    });

  }, [rawStores, searchTerm, selectedCategory, minRating, favoriteIds]);

  const categories = useMemo(() => {
    const unique = new Set(rawStores?.map(s => s.category).filter(Boolean) || []);
    return ['Todas', ...Array.from(unique).filter(c => c !== 'Todas')];
  }, [rawStores]);

  const toggleFavorite = async (e: React.MouseEvent, store: Store) => {
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
            <footer className="py-6 text-center text-sm text-muted-foreground border-t">
                © 2024 EncomiendaYA. Todos los derechos reservados.
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
    <div className="container mx-auto pb-20 animate-in fade-in duration-500">
      <PageHeader 
        title={`Hola, ${userProfile?.displayName || 'Invitado'} 👋`} 
        description="¿Qué se te antoja comer hoy?" 
      />
      
      <FilterBar 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        minRating={minRating}
        setMinRating={setMinRating}
        categories={categories}
      />

      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <ShoppingBag className="h-5 w-5" /> Tiendas Disponibles
        <span className="text-sm font-normal text-muted-foreground ml-2">({filteredStores.length})</span>
      </h2>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredStores.length === 0 ? (
             <div className="col-span-full text-center py-12 opacity-70">
                <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-medium">No encontramos tiendas</p>
                <p className="text-sm">Intenta cambiar los filtros de búsqueda.</p>
                {/* Botón para limpiar filtros si no hay resultados */}
                {(searchTerm || selectedCategory !== 'Todas' || minRating !== '0') && (
                    <Button variant="link" onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); setMinRating('0'); }} className="mt-2">
                        Limpiar Filtros
                    </Button>
                )}
            </div>
        ) : (
            filteredStores.map((store) => {
                const isFav = favoriteIds.has(store.id);
                return (
                    <Link href={`/stores/${store.id}`} key={store.id} className="group">
                        <Card className="h-full overflow-hidden hover:shadow-lg transition-all duration-300 border-transparent hover:border-primary/20 relative">
                            <div className="relative h-40 w-full bg-muted">
                                {store.imageUrl ? (
                                    <Image
                                        src={store.imageUrl}
                                        alt={store.name}
                                        fill
                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <StoreIcon className="h-10 w-10 opacity-20" />
                                    </div>
                                )}
                                <button
                                    onClick={(e) => toggleFavorite(e, store)}
                                    className="absolute top-2 right-2 p-2 rounded-full bg-white/80 hover:bg-white shadow-sm backdrop-blur-sm transition-all hover:scale-110 z-10"
                                >
                                    <Heart className={cn("h-5 w-5 transition-colors", isFav ? "fill-red-500 text-red-500" : "text-gray-500")} />
                                </button>
                                <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                                    {store.category || 'General'}
                                </span>
                            </div>

                            <CardHeader className="p-4 pb-2 space-y-1">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base font-bold line-clamp-1">{store.name}</CardTitle>
                                    {(store.rating || 0) > 0 && (
                                        <div className="flex items-center gap-1 text-xs font-medium bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                                            <Star className="h-3 w-3 fill-yellow-700" />
                                            {store.rating?.toFixed(1)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3" /> 
                                    {/* ✅ AQUI APLICAMOS LA LIMPIEZA */}
                                    <span className="line-clamp-1">{cleanAddress(store.address)}</span>
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
                );
            })
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