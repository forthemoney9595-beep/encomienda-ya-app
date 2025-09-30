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

export default function FoodStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [foodStores, setFoodStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      const foodCategories = ['Italiana', 'Comida Rápida', 'Japonesa', 'Mexicana', 'Saludable', 'Dulces'];
      const isPrototype = user?.uid.startsWith('proto-') ?? false;
      const allStores = await getStores(false, isPrototype);
      const filteredStores = allStores.filter(store => 
        store.status === 'Aprobado' && foodCategories.includes(store.category)
      );
      setFoodStores(filteredStores);
      setLoading(false);
    };
    
    if (!authLoading) {
      fetchStores();
    }
  }, [user, authLoading]);

  return (
    <div className="container mx-auto">
      <PageHeader title="Tiendas de Comida" description="Pide de los mejores restaurantes." />
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          <>
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
            <StoreCardSkeleton />
          </>
        ) : foodStores.length > 0 ? (
          foodStores.map((store) => (
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
            <p>No hay tiendas de comida aprobadas disponibles en este momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}
