
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import type { Store } from '@/lib/placeholder-data';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { StoreCardSkeleton } from '@/components/store-card-skeleton';
import { getStores } from '@/lib/data-service';

export default function FoodStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const { prototypeStores, loading: prototypeLoading } = usePrototypeData();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const isPrototype = user?.uid.startsWith('proto-');
  const foodCategories = ['italiana', 'comida-rapida', 'japonesa', 'mexicana', 'saludable', 'dulces'];

  useEffect(() => {
    async function fetchStores() {
        setLoading(true);
        if (isPrototype) {
            const foodStores = prototypeStores.filter(store => 
                store.status === 'Aprobado' && foodCategories.includes(store.category.toLowerCase())
            );
            setStores(foodStores);
        } else {
            const allStores = await getStores();
            const foodStores = allStores.filter(store => 
                foodCategories.includes(store.category.toLowerCase())
            );
            setStores(foodStores);
        }
        setLoading(false);
    }
    if (!prototypeLoading) {
        fetchStores();
    }
  }, [isPrototype, prototypeStores, prototypeLoading]);
  
  const isLoading = authLoading || loading;

  return (
    <div className="container mx-auto">
      <PageHeader title="Tiendas de Comida" description="Pide de los mejores restaurantes." />
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          <>
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
          </>
        ) : stores.length > 0 ? (
          stores.map((store) => (
            <Link href={`/stores/${store.id}`} key={store.id} className="group">
              <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out hover-shadow-xl hover:-translate-y-1">
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
            <p>No hay tiendas de comida aprobadas disponibles en este momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}
