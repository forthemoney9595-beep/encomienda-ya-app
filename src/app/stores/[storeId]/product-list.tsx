
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Product } from '@/lib/placeholder-data';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Edit, Trash2, PlusCircle } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { ManageItemDialog } from './manage-item-dialog';
import { addProductToStore, updateProductInStore, deleteProductFromStore } from '@/lib/data-service';

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
    const { addPrototypeProduct, updatePrototypeProduct, deletePrototypeProduct } = usePrototypeData();
    
    const isPrototypeMode = currentStoreId.startsWith('proto-');
    const products = initialProducts; // This will now be correctly passed from the parent which uses context
    
    // State for local UI management
    const [productCategories, setProductCategories] = useState<string[]>(initialCategories);
    const [isManageItemDialogOpen, setManageItemDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [openCartAlert, setOpenCartAlert] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

    const isOwner = user?.uid === ownerId;

    useEffect(() => {
        const categories = Array.from(new Set(products.map(p => p.category)));
        setProductCategories(categories.length > 0 ? categories : initialCategories);
    }, [products, initialCategories]);
    
    const findFirstCategoryWithProducts = () => {
        return productCategories.find(category => products.some(p => p.category.toLowerCase() === category.toLowerCase()));
    };

    const handleSaveProduct = async (productData: Product) => {
        const isEditing = products.some(p => p.id === productData.id);
        
        if (isPrototypeMode) {
            isEditing ? updatePrototypeProduct(currentStoreId, productData) : addPrototypeProduct(currentStoreId, productData);
        } else {
            // Optimistically update UI
            // This is complex, for now we rely on DB call and re-fetch which is slower but safer
            try {
                if (isEditing) {
                    await updateProductInStore(currentStoreId, productData.id, productData);
                } else {
                    await addProductToStore(currentStoreId, productData, productCategories);
                }
                // Here we should ideally re-fetch or pass new data up to the parent.
                // For simplicity, we can toast and let the user see the change on next visit,
                // or implement a more robust state management.
            } catch (error) {
                toast({ title: "Error", description: "No se pudo guardar el artículo en la base de datos.", variant: 'destructive'});
                return; // Prevent UI change if DB fails
            }
        }
        
        // This will now be updated via the useEffect
        if (!productCategories.map(c => c.toLowerCase()).includes(productData.category.toLowerCase())) {
            setProductCategories([...productCategories, productData.category]);
        }
        
        toast({ title: isEditing ? "¡Artículo Actualizado!" : "¡Artículo Añadido!" });
        setManageItemDialogOpen(false);
        setEditingProduct(null);
    };

    const handleDeleteProduct = async (productId: string) => {
        if (isPrototypeMode) {
            deletePrototypeProduct(currentStoreId, productId);
        } else {
            try {
                await deleteProductFromStore(currentStoreId, productId);
            } catch(error) {
                toast({ title: "Error", description: "No se pudo eliminar el artículo de la base de datos.", variant: 'destructive'});
                return;
            }
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
                productCategories={productCategories}
            />
            {isOwner && (
              <div className="mb-4">
                <Button onClick={handleOpenDialogForCreate}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Añadir Nuevo Artículo
                </Button>
              </div>
            )}
            <Tabs defaultValue={findFirstCategoryWithProducts()} className="w-full">
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
                                                            Esta acción no se puede deshacer y eliminará permanentemente el producto.
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
                {products.length === 0 && (
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
