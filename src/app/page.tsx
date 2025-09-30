'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import { getStores } from '@/lib/data-service';
import type { Store } from '@/lib/placeholder-data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from '@/components/ui/skeleton';

function StoreCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-48 w-full" />
      <CardHeader>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2 mt-2" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full" />
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    // This effect ensures we don't try to fetch data until auth state is resolved.
    if (authLoading) {
      return;
    }
    setInitialLoading(false); // Auth is resolved, we can now show the main content.

    const fetchStores = async () => {
      setDataLoading(true);
      const isPrototype = user?.uid.startsWith('proto-') ?? false;
      const fetchedStores = await getStores(false, isPrototype);
      setStores(fetchedStores.filter(s => s.status === 'Aprobado'));
      setDataLoading(false);
    };

    fetchStores();
  }, [user, authLoading]);

  return (
    <div className="container mx-auto">
      {initialLoading ? (
         <div className="mb-6">
            <Skeleton className="h-9 w-2/5" />
            <Skeleton className="h-5 w-3/5 mt-2" />
         </div>
      ) : (
        <PageHeader title="¡Bienvenido a EncomiendaYA!" description="Encuentra tus tiendas favoritas y haz tu pedido en línea." />
      )}
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(initialLoading || dataLoading) ? (
          <>
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
          </>
        ) : stores.length > 0 ? (
          stores.map((store) => (
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
            <p>No hay tiendas aprobadas disponibles en este momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}
