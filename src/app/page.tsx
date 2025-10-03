
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import type { Store } from '@/lib/placeholder-data';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { getStores } from '@/lib/data-service';

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { prototypeStores, loading: prototypeLoading } = usePrototypeData();
  const [searchQuery, setSearchQuery] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const isPrototype = user?.uid.startsWith('proto-');

  useEffect(() => {
    async function fetchStores() {
      setLoading(true);
      if (isPrototype) {
        setStores(prototypeStores.filter(store => store.status === 'Aprobado'));
      } else {
        const fetchedStores = await getStores();
        setStores(fetchedStores);
      }
      setLoading(false);
    }
    
    if (!prototypeLoading) {
        fetchStores();
    }
  }, [isPrototype, prototypeStores, prototypeLoading]);


  const filteredStores = useMemo(() => {
    if (!searchQuery) {
      return stores;
    }
    return stores.filter(store =>
      store.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stores, searchQuery]);

  const isLoading = authLoading || loading;

  return (
    <div className="container mx-auto">
      <PageHeader title="¡Bienvenido a EncomiendaYA!" description="Encuentra tus tiendas favoritas y haz tu pedido en línea." />
      
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar tiendas por nombre..."
          className="w-full pl-10 text-base"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          <>
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
          </>
        ) : filteredStores.length > 0 ? (
          filteredStores.filter(Boolean).map((store) => (
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
                </div>
                <CardHeader>
                  <CardTitle>{store.name}</CardTitle>
                  <CardDescription>{store.category}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{store.address}</p>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <div className="col-span-full text-center text-muted-foreground py-10">
            {searchQuery ? (
                 <p>No se encontraron tiendas para "{searchQuery}".</p>
            ) : (
                <>
                    <p>No hay tiendas aprobadas disponibles en este momento.</p>
                    <p className="text-sm">Si eres administrador, puedes aprobar tiendas en el panel de admin.</p>
                </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
