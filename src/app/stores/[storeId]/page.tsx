'use client';

import { useParams, useRouter } from 'next/navigation';
// ✅ CORRECCIÓN: Importamos desde @/lib/firebase para tener los hooks con onSnapshot (tiempo real)
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/lib/firebase';
import { doc, collection, query } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Store as StoreIcon, MapPin, Star, Plus, Package } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';

interface StoreData {
  name: string;
  description?: string;
  address?: string;
  imageUrl?: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  available?: boolean;
  isFeatured?: boolean;
  createdAt?: any;
}

export default function StorePublicPage() {
  const params = useParams();
  const storeId = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  
  const firestore = useFirestore();
  const { addToCart } = useCart();
  const { toast } = useToast();
  const router = useRouter();

  // 1. Obtener datos de la TIENDA
  const storeRef = useMemoFirebase(() => {
      return firestore && storeId ? doc(firestore, 'stores', storeId) : null;
  }, [firestore, storeId]);
  
  const { data: store, isLoading: storeLoading } = useDoc<StoreData>(storeRef);

  // 2. Obtener PRODUCTOS de la tienda (Tiempo Real)
  const productsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    // Escuchamos la colección completa. Si eliminas algo en el admin, desaparecerá aquí.
    return query(collection(firestore, 'stores', storeId, 'items'));
  }, [firestore, storeId]);

  const { data: rawProducts, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  // 3. Filtrar y Ordenar en el Cliente
  const products = useMemo(() => {
    if (!rawProducts) return [];
    
    return rawProducts
      // Solo mostramos productos que tengan available en true
      .filter(p => p.available === true)
      // Ordenamos por fecha: los más nuevos primero
      .sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });
  }, [rawProducts]);

  const handleAddToCart = (product: Product) => {
    if (!storeId) return;
    
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      description: product.description,
      category: product.category,
      imageUrl: product.imageUrl,
      rating: 0, 
      reviewCount: 0 
    }, storeId); 
    
    toast({
      title: "Agregado al carrito",
      description: `${product.name} ya está en tu pedido.`,
    });
  };

  if (storeLoading || productsLoading) {
    return (
      <div className="container mx-auto space-y-8 py-8">
        <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
            </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      </div>
    );
  }

  if (!store) {
    return (
        <div className="container mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold text-muted-foreground">Tienda no encontrada</h2>
            <Button variant="link" onClick={() => router.push('/')}>Volver al inicio</Button>
        </div>
    );
  }

  const featuredProducts = products.filter(p => p.isFeatured);
  const regularProducts = products.filter(p => !p.isFeatured);

  return (
    <div className="container mx-auto pb-20">
      {/* CABECERA */}
      <div className="relative bg-muted/30 -mx-4 px-4 py-8 sm:mx-0 sm:rounded-xl sm:mt-4 mb-8 border-b sm:border">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-sm border overflow-hidden shrink-0">
                {store.imageUrl ? (
                    <img src={store.imageUrl} alt={store.name} className="h-full w-full object-cover" />
                ) : (
                    <StoreIcon className="h-10 w-10 text-muted-foreground" />
                )}
            </div>
            <div className="text-center md:text-left space-y-2 flex-1">
                <h1 className="text-3xl font-bold tracking-tight">{store.name}</h1>
                <p className="text-muted-foreground max-w-2xl">{store.description || 'Sin descripción disponible.'}</p>
                {store.address && (
                    <div className="flex items-center justify-center md:justify-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" /> {store.address}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* DESTACADOS */}
      {featuredProducts.length > 0 && (
        <div className="mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" /> Recomendados
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredProducts.map(product => (
                    <ProductCard key={product.id} product={product} onAdd={handleAddToCart} isFeatured />
                ))}
            </div>
        </div>
      )}

      {/* MENU COMPLETO */}
      <h2 className="text-xl font-bold mb-4">Menú Completo</h2>
      {products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {regularProducts.map(product => (
                <ProductCard key={product.id} product={product} onAdd={handleAddToCart} />
            ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Esta tienda aún no tiene productos disponibles.</p>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, onAdd, isFeatured }: { product: Product, onAdd: (p: Product) => void, isFeatured?: boolean }) {
    return (
        <Card className={`flex flex-col overflow-hidden border hover:shadow-md transition-all ${isFeatured ? 'border-yellow-200 bg-yellow-50/30' : ''}`}>
            <div className="relative h-40 w-full bg-muted flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover hover:scale-105 transition-transform duration-500" />
                ) : (
                    <Package className="h-10 w-10 text-muted-foreground/50" />
                )}
                {isFeatured && (
                    <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
                        POPULAR
                    </span>
                )}
            </div>
            <CardHeader className="p-4 pb-0">
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base line-clamp-1">{product.name}</CardTitle>
                    <span className="font-bold text-green-700">${product.price}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1 h-8">{product.description}</p>
            </CardHeader>
            <CardFooter className="p-4 mt-auto">
                <Button onClick={() => onAdd(product)} className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Agregar
                </Button>
            </CardFooter>
        </Card>
    );
}