
'use client';

import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "./ui/sheet";
import { useCart } from "@/context/cart-context";
import { Badge } from "./ui/badge";
import Image from "next/image";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import Link from "next/link";
import { getPlaceholderImage } from "@/lib/placeholder-images";

export function Cart() {
  const { cart, totalItems, totalPrice, removeFromCart, updateQuantity } = useCart();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <Badge className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full p-1 text-xs">
              {totalItems}
            </Badge>
          )}
          <span className="sr-only">Abrir carrito</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Mi Carrito ({totalItems})</SheetTitle>
        </SheetHeader>
        {cart.length > 0 ? (
          <>
            <ScrollArea className="h-[calc(100vh-160px)] pr-4">
              <div className="mt-4 space-y-4">
                {cart.map(item => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="relative h-16 w-16 flex-shrink-0">
                        <Image 
                            src={item.imageUrl || getPlaceholderImage(item.id, 64, 64)} 
                            alt={item.name}
                            fill
                            style={{ objectFit: 'cover' }}
                            className="rounded-md" 
                        />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-muted-foreground">${item.price.toFixed(2)}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center">{item.quantity}</span>
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                        <Button variant="ghost" size="icon" className="h-8 w-8 mt-1 text-destructive" onClick={() => removeFromCart(item.id)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <SheetFooter className="mt-4">
              <div className="w-full space-y-4">
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
                <SheetClose asChild>
                  <Button className="w-full" asChild>
                    <Link href="/checkout">Proceder al Pago</Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetFooter>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <ShoppingCart className="h-16 w-16 mb-4" />
            <p className="text-lg">Tu carrito está vacío.</p>
            <p>¡Añade productos para empezar a comprar!</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
