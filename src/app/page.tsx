
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
import { useRouter } from 'next/navigation';
import { getStores as getStoresFromDb } from '@/lib/data-service';


export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { prototypeStores, loading: prototypeLoading } = usePrototypeData();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchAndMergeStores() {
      if (prototypeLoading) return;

      setLoading(true);
      // Fetch real stores from Firestore
      const realStores = await getStoresFromDb(false, false);
      
      // Create a map of real stores for quick lookup
      const realStoresMap = new Map(realStores.map(s => [s.id, s]));

      // Merge with prototype stores, giving precedence to real data if IDs conflict
      const allStores = [...prototypeStores];
      realStores.forEach(realStore => {
        const index = allStores.findIndex(s => s.id === realStore.id);
        if (index !== -1) {
          allStores[index] = realStore; // Replace prototype with real
        } else {
          allStores.push(realStore); // Add new real store
        }
      });
      
      setStores(allStores.filter(s => s.status === 'Aprobado'));
      setLoading(false);
    }
    
    fetchAndMergeStores();
  }, [prototypeStores, prototypeLoading]);


  return (
    <div className="container mx-auto">
      <PageHeader title="¡Bienvenido a EncomiendaYA!" description="Encuentra tus tiendas favoritas y haz tu pedido en línea." />
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading || authLoading ? (
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
            <p className="text-sm">Si eres dueño de una tienda, puedes crear una yendo a "Registrarse".</p>
          </div>
        )}
      </div>
    </div>
  );
}
