
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Product } from '@/lib/placeholder-data';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Edit, Trash2, PlusCircle, Search, Star, Heart } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { ManageItemDialog } from './manage-item-dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProductReviewsDialog } from './product-reviews-dialog';

interface ProductListProps {
    products: Product[];
    productCategories: string[];
    ownerId: string;
    onSaveProduct: (productData: Product) => void;
    onDeleteProduct: (productId: string) => void;
}

function ProductRating({ rating, reviewCount, onClick }: { rating: number, reviewCount: number, onClick: () => void }) {
  if (reviewCount === 0) return null;

  return (
    <Button variant="ghost" size="sm" className="flex items-center gap-1 text-sm text-muted-foreground mt-1 -ml-3" onClick={onClick}>
      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
      <span className="font-bold text-amber-500">{rating.toFixed(1)}</span>
      <span>({reviewCount} reseñas)</span>
    </Button>
  )
}

export function ProductList({ products, productCategories, ownerId, onSaveProduct, onDeleteProduct }: ProductListProps) {
    const { addToCart, storeId: cartStoreId, clearCart } = useCart();
    const { toast } = useToast();
    const params = useParams();
    const currentStoreId = params.storeId as string;
    const { user } = useAuth();
    const { favoriteProducts, toggleFavoriteProduct } = usePrototypeData();
    
    const [isManageItemDialogOpen, setManageItemDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [openCartAlert, setOpenCartAlert] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingReviewsFor, setViewingReviewsFor] = useState<Product | null>(null);

    const isOwner = user?.uid === ownerId;

    const filteredProducts = useMemo(() => {
        if (!searchQuery) return products;
        return products.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [products, searchQuery]);

    const activeCategories = useMemo(() => {
      return Array.from(new Set(filteredProducts.map(p => p.category)));
    }, [filteredProducts]);

    const findFirstCategoryWithProducts = () => {
        return productCategories.find(category => filteredProducts.some(p => p.category.toLowerCase() === category.toLowerCase())) || (activeCategories[0] || "");
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
    
    const handleFavoriteToggle = (product: Product) => {
        if (!user) {
            toast({
                variant: 'destructive',
                title: 'Inicia Sesión para Guardar',
                description: 'Debes iniciar sesión para guardar favoritos.',
            });
            return;
        }
        toggleFavoriteProduct(product.id);
        const isFavorite = favoriteProducts.includes(product.id);
        toast({
            title: isFavorite ? 'Eliminado de Favoritos' : 'Añadido a Favoritos',
            description: `${product.name} ha sido ${isFavorite ? 'eliminado de' : 'añadido a'} tus favoritos.`,
        });
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
                onSave={(productData) => {
                    onSaveProduct(productData);
                    setManageItemDialogOpen(false);
                }}
                productCategories={productCategories}
            />
            <ProductReviewsDialog
                isOpen={!!viewingReviewsFor}
                setIsOpen={(isOpen) => !isOpen && setViewingReviewsFor(null)}
                product={viewingReviewsFor}
            />

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative w-full sm:flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Buscar productos..."
                        className="w-full pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {isOwner && (
                    <Button onClick={handleOpenDialogForCreate} className="w-full sm:w-auto">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Añadir Artículo
                    </Button>
                )}
            </div>

            <Tabs defaultValue={findFirstCategoryWithProducts()} key={findFirstCategoryWithProducts()} className="w-full">
                <TabsList className="mb-4">
                    {productCategories.map(category => (
                       (activeCategories.length === 0 || activeCategories.map(c => c.toLowerCase()).includes(category.toLowerCase())) &&
                        <TabsTrigger key={category} value={category}>{category}</TabsTrigger>
                    ))}
                </TabsList>

                {productCategories.map(category => {
                    const categoryProducts = filteredProducts.filter(p => p.category.toLowerCase() === category.toLowerCase());
                    if (categoryProducts.length === 0 && searchQuery) return null;

                    return (
                        <TabsContent key={category} value={category}>
                          {categoryProducts.length > 0 ? (
                            <div className="space-y-4">
                                {categoryProducts.map((product) => {
                                    const isFavorite = favoriteProducts.includes(product.id);
                                    return (
                                    <Card key={product.id}>
                                        <CardContent className="flex items-start gap-4 p-4">
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
                                                <ProductRating 
                                                    rating={product.rating} 
                                                    reviewCount={product.reviewCount} 
                                                    onClick={() => setViewingReviewsFor(product)}
                                                />
                                                <p className="text-sm text-muted-foreground mt-2">{product.description}</p>
                                                <p className="font-semibold mt-1">${product.price.toFixed(2)}</p>
                                            </div>
                                            {isOwner ? (
                                                <div className="flex flex-col sm:flex-row gap-2">
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
                                                                <AlertDialogAction onClick={() => onDeleteProduct(product.id)}>
                                                                    Sí, eliminar
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 items-center self-center">
                                                    <Button variant="outline" size="sm" onClick={() => handleAddToCart(product)} className="w-full">
                                                        <ShoppingCart className="mr-2 h-4 w-4" />
                                                        Añadir
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleFavoriteToggle(product)} className={cn("w-full text-muted-foreground", isFavorite && "text-red-500")}>
                                                        <Heart className={cn("h-4 w-4", isFavorite && "fill-current")}/>
                                                        <span className="ml-2">{isFavorite ? 'Favorito' : 'Guardar'}</span>
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )})}
                            </div>
                           ) : !searchQuery && (
                             <div className="text-center text-muted-foreground py-10">
                                <p>No hay productos en esta categoría.</p>
                                {isOwner && <p className="text-sm">¡Añade tu primer artículo a "{category}"!</p>}
                            </div>
                           )}
                        </TabsContent>
                    );
                })}
                {filteredProducts.length === 0 && products.length > 0 && (
                    <div className="text-center text-muted-foreground py-10 col-span-full">
                        <p>No se encontraron productos para "{searchQuery}".</p>
                    </div>
                )}
                 {products.length === 0 && (
                    <div className="text-center text-muted-foreground py-10 col-span-full">
                        <p>{isOwner ? 'Esta tienda aún no tiene productos. ¡Añade tu primer artículo!' : 'Esta tienda aún no tiene productos.'}</p>
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
