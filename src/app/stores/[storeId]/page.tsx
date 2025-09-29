'use client';

import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getProductsByStoreId } from '@/lib/placeholder-data';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { AddItemDialog } from './add-item-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCart } from '@/context/cart-context';
import type { Product, Store } from '@/lib/placeholder-data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';

async function getStoreById(id: string): Promise<Store | null> {
  try {
    const docRef = doc(db, "stores", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Store;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching store:", error);
    return null;
  }
}

export default function StoreDetailPage({ params }: { params: { storeId: string } }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  const products = getProductsByStoreId(params.storeId);
  const { addToCart } = useCart();
  const { toast } = useToast();
  const { user } = useAuth();
  
  useEffect(() => {
    const fetchStore = async () => {
      setLoading(true);
      const storeData = await getStoreById(params.storeId);
      if (storeData) {
        setStore(storeData);
      }
      setLoading(false);
    }
    fetchStore();
  }, [params.storeId]);

  const isStoreOwner = user?.role === 'store' && user?.storeId === store?.id;

  if (loading) {
     return (
      <div className="container mx-auto">
        <PageHeader title={<Skeleton className="h-8 w-64" />} description={<Skeleton className="h-5 w-48" />} />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </CardContent>
            </Card>
          </div>
           <div className="md:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>Información de la Tienda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-48 w-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-4 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-4 w-full" />
                    </div>
                </CardContent>
            </Card>
          </div>
        </div>
      </div>
     )
  }

  if (!store) {
    notFound();
  }

  const handleAddToCart = (product: Product) => {
    addToCart(product);
    toast({
      title: '¡Añadido al carrito!',
      description: `${product.name} ha sido añadido a tu carrito.`,
    });
  };

  const productCategories = Array.from(new Set(products.map(p => p.category)));

  return (
    <div className="container mx-auto">
      <PageHeader title={store.name} description={store.category}>
        {isStoreOwner && <AddItemDialog />}
      </PageHeader>
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue={productCategories[0] || 'all'}>
                    <TabsList className="mb-4">
                      {productCategories.map(category => (
                        <TabsTrigger key={category} value={category}>{category}</TabsTrigger>
                      ))}
                    </TabsList>
                    {productCategories.map(category => (
                      <TabsContent key={category} value={category}>
                        <div className="space-y-4">
                            {products.filter(p => p.category === category).map((product) => (
                                <Card key={product.id}>
                                  <CardContent className="flex items-center gap-4 p-4">
                                      <Image src={`https://picsum.photos/seed/${product.id}/80/80`} alt={product.name} width={80} height={80} className="rounded-md" data-ai-hint="food item" />
                                      <div className="flex-1">
                                          <h3 className="font-semibold">{product.name}</h3>
                                          <p className="text-sm text-muted-foreground">{product.description}</p>
                                          <p className="font-semibold">${product.price.toFixed(2)}</p>
                                      </div>
                                      <Button variant="outline" size="sm" onClick={() => handleAddToCart(product)}>
                                        <ShoppingCart className="mr-2 h-4 w-4" />
                                        Añadir
                                      </Button>
                                  </CardContent>
                                </Card>
                            ))}
                        </div>
                      </TabsContent>
                    ))}
                     {products.length === 0 && (
                        <div className="text-center text-muted-foreground py-10">
                            <p>Esta tienda aún no tiene productos.</p>
                        </div>
                    )}
                  </Tabs>
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
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
