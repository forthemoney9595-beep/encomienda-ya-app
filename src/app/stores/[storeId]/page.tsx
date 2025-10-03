
'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductList } from './product-list';
import { useEffect, useState } from 'react';
import type { Store, Product } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Button } from '@/components/ui/button';
import { Edit, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { addProductToStore, updateProductInStore, deleteProductFromStore } from '@/lib/data-service';

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
  const { getStoreById, updatePrototypeProduct, addPrototypeProduct, deletePrototypeProduct, prototypeStores, loading: prototypeLoading } = usePrototypeData();
  const { toast } = useToast();
  
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.storeId === storeId;
  const isPrototype = user?.uid.startsWith('proto-');

  // Fetch and update store data whenever prototype data changes
  useEffect(() => {
    if (!storeId || authLoading || prototypeLoading) return;
    
    const storeData = getStoreById(storeId);
    
    if (!storeData) {
      if (!loading) notFound(); // Prevent notFound flash on initial load
      return;
    }
    
    setStore(storeData);
    setLoading(false);
  }, [storeId, prototypeLoading, authLoading, user, getStoreById, prototypeStores, loading]);
  
  const handleSaveProduct = async (productData: Product) => {
      const isEditing = store?.products.some(p => p.id === productData.id);
      
      try {
          if (isPrototype) {
               if (isEditing) {
                  updatePrototypeProduct(storeId, productData);
              } else {
                  addPrototypeProduct(storeId, productData);
              }
          } else {
              // Real DB logic would go here
              if (isEditing) {
                  await updateProductInStore(storeId, productData.id, productData);
              } else {
                  await addProductToStore(storeId, productData, store?.productCategories || []);
              }
          }
           
          toast({ title: isEditing ? "¡Artículo Actualizado!" : "¡Artículo Añadido!" });
          
      } catch (error) {
           toast({ title: "Error", description: "No se pudo guardar el artículo.", variant: 'destructive'});
      }
  };

  const handleDeleteProduct = async (productId: string) => {
      try {
          if (isPrototype) {
              deletePrototypeProduct(storeId, productId);
          } else {
              // Real DB logic
              await deleteProductFromStore(storeId, productId);
          }
          
          toast({
              title: "Producto Eliminado",
              description: "El producto ha sido eliminado.",
          });

      } catch(error) {
          toast({ title: "Error", description: "No se pudo eliminar el artículo.", variant: 'destructive'});
      }
  };


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
  const productCategories = store.productCategories && store.productCategories.length > 0 ? store.productCategories : [];


  return (
    <div className="container mx-auto">
        <PageHeader title={store.name} description={store.category}>
            {isOwner && (
                <Button onClick={() => router.push(`/my-store`)}>
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
                  <ProductList 
                    products={store.products} 
                    productCategories={productCategories} 
                    ownerId={store.ownerId}
                    onSaveProduct={handleSaveProduct}
                    onDeleteProduct={handleDeleteProduct}
                   />
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
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
