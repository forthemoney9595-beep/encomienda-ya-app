'use server';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/page-header';
import { getStores } from '@/lib/data-service';
import type { Store } from '@/lib/placeholder-data';

export default async function FoodStoresPage() {
  const foodCategories = ['Italiana', 'Comida Rápida', 'Japonesa', 'Mexicana', 'Saludable', 'Dulces'];
  
  const allStores = await getStores();
  const foodStores = allStores.filter(store => 
    store.status === 'Aprobado' && foodCategories.includes(store.category)
  );

  return (
    <div className="container mx-auto">
      <PageHeader title="Tiendas de Comida" description="Pide de los mejores restaurantes." />
      
      {/* La barra de búsqueda interactiva se elimina temporalmente para la refactorización a componente de servidor. */}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {foodStores.length > 0 ? (
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
