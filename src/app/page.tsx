
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import { getStores } from '@/lib/data-service';
import type { Store } from '@/lib/placeholder-data';
import { useAuth } from '@/context/auth-context';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || authLoading) {
      return;
    }
    
    // If the user is a store owner, redirect them to their order management page
    if (user && user.role === 'store') {
        router.push('/orders');
        return;
    }

    const fetchStores = async () => {
      setLoading(true);
      const isPrototype = user?.uid.startsWith('proto-') ?? false;
      const fetchedStores = await getStores(false, isPrototype);
      setStores(fetchedStores.filter(s => s.status === 'Aprobado'));
      setLoading(false);
    };

    fetchStores();
  }, [user, authLoading, isClient, router]);

  // Don't render the page content if we're about to redirect for a store owner
  if (user && user.role === 'store') {
      return (
        <div className="container mx-auto text-center py-20">
          <p>Redirigiendo a tu panel de tienda...</p>
        </div>
      );
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="¡Bienvenido a EncomiendaYA!" description="Encuentra tus tiendas favoritas y haz tu pedido en línea." />
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading || !isClient ? (
          <>
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
          </>
        ) : stores.length > 0 ? (
          stores.filter(Boolean).map((store) => (
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
