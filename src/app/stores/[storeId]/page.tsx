
'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductList } from './product-list';
import { ContactStore } from './contact-store';
import { useEffect, useState } from 'react';
import type { Store, Product } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Button } from '@/components/ui/button';
import { Edit, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  const router = useRouter();
  const storeId = params.storeId as string;
  const { user, loading: authLoading } = useAuth();
  const { prototypeStores, loading: prototypeLoading } = usePrototypeData();
  
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.storeId === storeId;

  useEffect(() => {
    async function fetchData() {
        if (!storeId || authLoading || prototypeLoading) return;
        
        setLoading(true);
        // In pure prototype mode, we only fetch from prototype context
        const storeData = prototypeStores.find(s => s.id === storeId);
        
        if (!storeData) {
            notFound();
            return;
        }
        
        setStore(storeData);
        setLoading(false);
    }
    fetchData();
  }, [storeId, prototypeStores, prototypeLoading, authLoading, user]);


  if (loading) {
    return (
         <div className="container mx-auto">
            <PageHeader title={<Skeleton className='h-9 w-1/2' />} description={<Skeleton className='h-5 w-1/3' />} />
            <StoreDetailSkeleton />
        </div>
    )
  }
  
  if (!store) {
    return notFound();
  }


  // Use the dynamically managed productCategories from the store document
  const productCategories = store.productCategories && store.productCategories.length > 0 ? store.productCategories : [store.category];


  return (
    <div className="container mx-auto">
        <PageHeader title={store.name} description={store.category}>
            {isOwner && (
                <Button onClick={() => router.push(`/admin/my-store`)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar Tienda
                </Button>
            )}
        </PageHeader>
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProductList products={store.products} productCategories={productCategories} ownerId={store.ownerId} />
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
                        <div className='flex justify-between items-center mb-1'>
                            <h3 className="font-semibold">Estado</h3>
                            {/* NOTE: This is static for now. For dynamic, you'd compare current time with store hours */}
                             <Badge variant="secondary" className="text-green-600">Abierto</Badge>
                        </div>
                    </div>
                     <div>
                        <h3 className="font-semibold">Horario</h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                           <Clock className="h-4 w-4" /> {store.horario}
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold">Dirección</h3>
                        <p className="text-muted-foreground">{store.address}</p>
                    </div>
                     <ContactStore storeId={store.id} />
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
