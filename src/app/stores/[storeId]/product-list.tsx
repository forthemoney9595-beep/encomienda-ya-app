
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Product } from '@/lib/placeholder-data';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Edit, Trash2 } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { ManageItemDialog } from './manage-item-dialog';
import { addProductToStore, updateProductInStore, deleteProductFromStore } from '@/lib/data-service';
import { getPrototypeProducts } from '@/lib/placeholder-data';

interface ProductListProps {
    products: Product[];
    productCategories: string[];
    ownerId: string;
}

export function ProductList({ products: initialProducts, productCategories: initialCategories, ownerId }: ProductListProps) {
    const { addToCart, storeId: cartStoreId, clearCart } = useCart();
    const { toast } = useToast();
    const params = useParams();
    const currentStoreId = params.storeId as string;
    const { user } = useAuth();
    
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [productCategories, setProductCategories] = useState<string[]>(initialCategories);
    
    const [isManageItemDialogOpen, setManageItemDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const isOwner = user?.uid === ownerId;

    const [openCartAlert, setOpenCartAlert] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
    
    useEffect(() => {
        // Since prototype data is now static, we just set it on initial load.
        // The state will handle in-memory updates.
        if (currentStoreId.startsWith('proto-')) {
            const protoProducts = getPrototypeProducts(currentStoreId);
            setProducts(protoProducts);
            const categories = new Set(protoProducts.map(p => p.category));
            setProductCategories(Array.from(categories));
        } else {
            setProducts(initialProducts);
            setProductCategories(initialCategories);
        }
    }, [currentStoreId, initialProducts, initialCategories]);


    const handleSaveProduct = async (productData: Product) => {
        const isEditing = products.some(p => p.id === productData.id);
        
        let updatedProducts;
        if (isEditing) {
            updatedProducts = products.map(p => (p.id === productData.id ? productData : p));
        } else {
            updatedProducts = [...products, productData];
        }
        setProducts(updatedProducts);

        // Unify category logic: always check if the new/updated category exists and add if not.
        if (!productCategories.map(c => c.toLowerCase()).includes(productData.category.toLowerCase())) {
            setProductCategories(prev => [...prev, productData.category]);
        }

        // Real backend update (for non-prototype)
        if (!currentStoreId.startsWith('proto-')) {
            if (isEditing) {
                await updateProductInStore(currentStoreId, productData.id, productData);
            } else {
                await addProductToStore(currentStoreId, productData, productCategories);
            }
        }
        
        toast({ title: isEditing ? "¡Artículo Actualizado!" : "¡Artículo Añadido!" });
        setManageItemDialogOpen(false);
        setEditingProduct(null);
    };

    const handleDeleteProduct = async (productId: string) => {
        setProducts(products.filter(p => p.id !== productId));
        if (!currentStoreId.startsWith('proto-')) {
            await deleteProductFromStore(currentStoreId, productId);
        }
       
        toast({
            title: "Producto Eliminado",
            description: "El producto ha sido eliminado.",
        });
    };

    const handleOpenDialogForEdit = (product: Product) => {
        setEditingProduct(product);
        setManageItemDialogOpen(true);
    };

    const handleOpenDialogForCreate = () => {
        setEditingProduct(null);
        setManageItemDialogOpen(true);
    };
    
    const handleAddToCart = (product: Product) => {
        if (!user) {
            toast({
                variant: 'destructive',
                title: 'Inicia Sesión para Comprar',
                description: 'Debes iniciar sesión para añadir artículos a tu carrito.',
            });
            return;
        }
        if (!cartStoreId || cartStoreId === currentStoreId) {
            addToCart(product, currentStoreId);
            toast({
              title: '¡Añadido al carrito!',
              description: `${product.name} ha sido añadido a tu carrito.`,
            });
        } else {
            setPendingProduct(product);
            setOpenCartAlert(true);
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
        setOpenCartAlert(false);
        setPendingProduct(null);
    }
    
    return (
        <>
            <ManageItemDialog
                isOpen={isManageItemDialogOpen}
                setIsOpen={setManageItemDialogOpen}
                product={editingProduct}
                onSave={handleSaveProduct}
            />
            {isOwner && (
              <div className="mb-4">
                <Button onClick={handleOpenDialogForCreate}>
                  Añadir Nuevo Artículo
                </Button>
              </div>
            )}
            <Tabs defaultValue={productCategories[0] || 'all'} className="w-full">
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
                                            src={product.imageUrl || ''}
                                            alt={product.name} 
                                            fill
                                            style={{ objectFit: 'cover' }}
                                            className="rounded-md bg-muted" 
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold">{product.name}</h3>
                                        <p className="text-sm text-muted-foreground">{product.description}</p>
                                        <p className="font-semibold">${product.price.toFixed(2)}</p>
                                    </div>
                                    {isOwner ? (
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenDialogForEdit(product)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Editar
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Eliminar
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. Esto eliminará permanentemente el producto (hasta que recargues la página en modo prototipo).
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteProduct(product.id)}>
                                                            Sí, eliminar
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
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
                         {products.filter(p => p.category.toLowerCase() === category.toLowerCase()).length === 0 && (
                            <div className="text-center text-muted-foreground py-10">
                                <p>No hay productos en esta categoría.</p>
                            </div>
                        )}
                    </div>
                    </TabsContent>
                ))}
                {products.length === 0 && productCategories.length === 0 && (
                    <div className="text-center text-muted-foreground py-10">
                        <p>{isOwner ? 'Esta tienda aún no tiene productos. ¡Añade tu primer artículo usando el botón de arriba!' : 'Esta tienda aún no tiene productos.'}</p>
                    </div>
                )}
            </Tabs>
             <AlertDialog open={openCartAlert} onOpenChange={setOpenCartAlert}>
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
