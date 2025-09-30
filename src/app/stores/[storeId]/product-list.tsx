
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
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { ManageItemDialog } from './manage-item-dialog';
import { getPrototypeProducts, savePrototypeProducts } from '@/lib/placeholder-data';

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
    
    // Manage products in local state. Start with initialProducts to avoid hydration errors.
    const [products, setProducts] = useState<Product[]>(initialProducts);
    
    const [isManageItemDialogOpen, setManageItemDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const isOwner = user?.uid === ownerId;

    const [openCartAlert, setOpenCartAlert] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

    // This effect runs only on the client, after hydration
    useEffect(() => {
        if (currentStoreId === 'proto-store-id') {
            const storedProducts = getPrototypeProducts();
            setProducts(storedProducts);
        }
    }, [currentStoreId]);

    const handleOpenDialogForEdit = (product: Product) => {
        setEditingProduct(product);
        setManageItemDialogOpen(true);
    };

    const handleOpenDialogForCreate = () => {
        setEditingProduct(null);
        setManageItemDialogOpen(true);
    };
    
    const handleSaveProduct = (productData: Product, id?: string) => {
        let updatedProducts;
        if (id) { // Editing existing product
            updatedProducts = products.map(p => p.id === id ? { ...p, ...productData, id: p.id } : p);
            toast({ title: "¡Artículo Actualizado!" });
        } else { // Creating new product
            const newProductWithId = { ...productData, id: `proto-prod-${Date.now()}` };
            updatedProducts = [...products, newProductWithId];
            toast({ title: "¡Artículo Guardado!" });
        }
        setProducts(updatedProducts);
        if (currentStoreId === 'proto-store-id') {
            savePrototypeProducts(updatedProducts);
        }
    };
    
    const handleDeleteProduct = (productId: string) => {
        const updatedProducts = products.filter(p => p.id !== productId);
        setProducts(updatedProducts);
         if (currentStoreId === 'proto-store-id') {
            savePrototypeProducts(updatedProducts);
        }
        toast({
            title: "Producto Eliminado",
            description: "El producto ha sido eliminado correctamente.",
        });
    };


    const handleAddToCart = (product: Product) => {
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

    // Function to handle saving from the dialog
    const onSaveFromDialog = (data: Product, id?: string) => {
        handleSaveProduct(data, id);
    };

    return (
        <>
            <ManageItemDialog
                isOpen={isManageItemDialogOpen}
                setIsOpen={setManageItemDialogOpen}
                product={editingProduct}
                onSave={onSaveFromDialog}
            />
            {isOwner && (
              <div className="mb-4">
                <Button onClick={handleOpenDialogForCreate}>
                  Añadir Nuevo Artículo
                </Button>
              </div>
            )}
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
                                                            Esta acción no se puede deshacer. Esto eliminará permanentemente el producto.
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
