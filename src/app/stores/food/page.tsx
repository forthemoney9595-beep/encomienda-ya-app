'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import PageHeader from '@/components/page-header';
import { getStores } from '@/lib/data-service';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';

export default function FoodStoresPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const foodCategories = ['Italiana', 'Comida Rápida', 'Japonesa', 'Mexicana', 'Saludable', 'Dulces'];

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      const allStores = await getStores();
      // Filter for approved stores that are in food categories
      const foodStores = allStores.filter(store => 
        store.status === 'Aprobado' && foodCategories.includes(store.category)
      );
      setStores(foodStores);
      setLoading(false);
    };
    fetchStores();
  }, []);

  const filteredStores = useMemo(() => {
    if (!searchTerm) {
      return stores;
    }
    return stores.filter((store) =>
      store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, stores]);

  return (
    <div className="container mx-auto">
      <PageHeader title="Tiendas de Comida" description="Pide de los mejores restaurantes." />
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Buscar restaurantes..." 
          className="pl-10 text-base" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-full overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredStores.length > 0 ? (
            filteredStores.map((store) => (
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
              <p>No se encontraron tiendas con ese criterio de búsqueda.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
