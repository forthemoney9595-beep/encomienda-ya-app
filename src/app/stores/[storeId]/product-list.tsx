'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Product } from '@/lib/placeholder-data';
import { getPrototypeProducts } from '@/lib/placeholder-data';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Edit, Trash2 } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import { useAuth } from '@/context/auth-context';

interface ProductListProps {
    products: Product[];
    productCategories: string[];
    ownerId: string;
}

export function ProductList({ products: initialProducts, productCategories, ownerId }: ProductListProps) {
    const { addToCart, storeId: cartStoreId, clearCart } = useCart();
    const { toast } = useToast();
    const params = useParams();
    const currentStoreId = params.storeId as string;
    const { user } = useAuth();

    const [products, setProducts] = useState(initialProducts);
    
    const isOwner = user?.uid === ownerId;

    const [openAlert, setOpenAlert] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

    useEffect(() => {
        const handleProductAdded = () => {
            // This is specific for prototype mode to force a re-read from sessionStorage
            if (currentStoreId === 'proto-store-id') {
                const updatedProducts = getPrototypeProducts();
                setProducts(updatedProducts);
            }
        };

        window.addEventListener('product-added', handleProductAdded);

        return () => {
            window.removeEventListener('product-added', handleProductAdded);
        };
    }, [currentStoreId]);


    const handleAddToCart = (product: Product) => {
        // If cart is empty or from the same store, add directly
        if (!cartStoreId || cartStoreId === currentStoreId) {
            addToCart(product, currentStoreId);
            toast({
              title: '¡Añadido al carrito!',
              description: `${product.name} ha sido añadido a tu carrito.`,
            });
        } else {
            // If from a different store, ask for confirmation
            setPendingProduct(product);
            setOpenAlert(true);
        }
    };

    const confirmAndAddToCart = () => {
        if (pendingProduct) {
            clearCart();
            addToCart(pendingProduct, currentStoreId);
            toast({
              title: '¡Carrito actualizado!',
              description: `Se ha vaciado tu carrito y se ha añadido ${pendingProduct.name}.`,
            });
        }
        setOpenAlert(false);
        setPendingProduct(null);
    }

    return (
        <>
            <Tabs defaultValue={productCategories[0] || 'all'}>
                <TabsList className="mb-4">
                    {productCategories.map(category => (
                    <TabsTrigger key={category} value={category}>{category}</TabsTrigger>
                    ))}
                </TabsList>
                {productCategories.map(category => (
                    <TabsContent key={category} value={category}>
                    <div className="space-y-4">
                        {products.filter(p => p.category.toLowerCase() === category.toLowerCase()).map((product) => (
                            <Card key={product.id}>
                                <CardContent className="flex items-center gap-4 p-4">
                                    <div className="relative h-20 w-20 flex-shrink-0">
                                        <Image 
                                            src={product.imageUrl || getPlaceholderImage(product.id, 80, 80)} 
                                            alt={product.name} 
                                            fill
                                            style={{ objectFit: 'cover' }}
                                            className="rounded-md" 
                                            data-ai-hint="food item" 
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold">{product.name}</h3>
                                        <p className="text-sm text-muted-foreground">{product.description}</p>
                                        <p className="font-semibold">${product.price.toFixed(2)}</p>
                                    </div>
                                    {isOwner ? (
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => alert('Próximamente: Editar')}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Editar
                                            </Button>
                                            <Button variant="destructive" size="sm" onClick={() => alert('Próximamente: Eliminar')}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Eliminar
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button variant="outline" size="sm" onClick={() => handleAddToCart(product)}>
                                            <ShoppingCart className="mr-2 h-4 w-4" />
                                            Añadir
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    </TabsContent>
                ))}
                {products.length === 0 && (
                    <div className="text-center text-muted-foreground py-10">
                        <p>Esta tienda aún no tiene productos.</p>
                         {isOwner && <p>¡Añade tu primer artículo usando el botón de arriba!</p>}
                    </div>
                )}
            </Tabs>
             <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>¿Vaciar carrito actual?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tu carrito contiene productos de otra tienda. Solo puedes pedir de una tienda a la vez. ¿Quieres vaciar tu carrito actual y añadir este artículo?
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPendingProduct(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmAndAddToCart}>Sí, vaciar y añadir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
