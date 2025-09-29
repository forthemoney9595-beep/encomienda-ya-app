'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Product } from '@/lib/placeholder-data';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';


interface ProductListProps {
    products: Product[];
    productCategories: string[];
}

export function ProductList({ products, productCategories }: ProductListProps) {
    const { addToCart } = useCart();
    const { toast } = useToast();

    const handleAddToCart = (product: Product) => {
        addToCart(product);
        toast({
          title: '¡Añadido al carrito!',
          description: `${product.name} ha sido añadido a tu carrito.`,
        });
      };

    return (
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
                                <div className="relative h-20 w-20 flex-shrink-0">
                                    <Image 
                                        src={product.imageUrl || `https://picsum.photos/seed/${product.id}/80/80`} 
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
    )
}
