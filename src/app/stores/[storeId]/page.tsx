'use client';

import { notFound, useParams } from 'next/navigation';
import Image from 'next/image';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoreById, getProductsByStoreId } from '@/lib/data-service';
import { StoreOwnerTools } from './store-owner-tools';
import { ProductList } from './product-list';
import { ContactStore } from './contact-store';
import { useEffect, useState } from 'react';
import type { Store, Product } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';

function StoreDetailSkeleton() {
    return (
        <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/3" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4 p-4 border rounded-md">
                             <Skeleton className="h-20 w-20 rounded-md" />
                             <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-5 w-1/4" />
                             </div>
                             <Skeleton className="h-9 w-24" />
                        </div>
                         <div className="flex items-center gap-4 p-4 border rounded-md">
                             <Skeleton className="h-20 w-20 rounded-md" />
                             <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-5 w-1/4" />
                             </div>
                             <Skeleton className="h-9 w-24" />
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-1">
                <Card>
                    <CardHeader>
                         <Skeleton className="h-8 w-1/2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-48 w-full rounded-md" />
                        <div className='space-y-2'>
                           <Skeleton className="h-5 w-1/4" />
                           <Skeleton className="h-4 w-3/4" />
                        </div>
                         <div className='space-y-2'>
                           <Skeleton className="h-5 w-1/4" />
                           <Skeleton className="h-4 w-1/2" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default function StoreDetailPage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
        if (!storeId) return;
        
        try {
            const [storeData, productsData] = await Promise.all([
                getStoreById(storeId),
                getProductsByStoreId(storeId)
            ]);

            if (!storeData) {
                notFound();
                return;
            }

            setStore(storeData);
            setProducts(productsData);
        } catch (error) {
            console.error("Failed to fetch store data:", error);
            // Handle error appropriately, maybe show a toast
        } finally {
            setLoading(false);
        }
    }
    fetchData();
  }, [storeId]);


  if (loading) {
    return (
         <div className="container mx-auto">
            <PageHeader title={<Skeleton className='h-9 w-1/2' />} description={<Skeleton className='h-5 w-1/3' />} />
            <StoreDetailSkeleton />
        </div>
    )
  }
  
  if (!store) {
    // This can happen if the fetch fails but loading is finished.
    // Or handle this with a dedicated error component.
    return notFound();
  }


  // Use the dynamically managed productCategories from the store document
  const productCategories = store.productCategories && store.productCategories.length > 0 ? store.productCategories : [store.category];


  return (
    <div className="container mx-auto">
        <PageHeader title={store.name} description={store.category}>
            <StoreOwnerTools storeId={store.id} ownerId={store.ownerId} productCategories={productCategories} />
        </PageHeader>
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProductList products={products} productCategories={productCategories} ownerId={store.ownerId} />
                </CardContent>
            </Card>
        </div>
        <div className="md:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>Información de la Tienda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative h-48 w-full">
                        <Image
                        src={store.imageUrl}
                        alt={store.name}
                        fill
                        style={{ objectFit: 'cover' }}
                        className="rounded-md"
                        data-ai-hint={store.imageHint}
                        />
                    </div>
                    <div>
                        <h3 className="font-semibold">Dirección</h3>
                        <p className="text-muted-foreground">{store.address}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold">Horario</h3>
                        <p className="text-muted-foreground">Lun-Dom: 11:00 AM - 10:00 PM</p>
                    </div>
                     <ContactStore storeId={store.id} />
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
