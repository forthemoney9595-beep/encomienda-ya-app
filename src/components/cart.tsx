'use client';

import { useState } from "react";
import { ShoppingCart, Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "./ui/sheet";
import { useCart } from "@/context/cart-context";
import { Badge } from "./ui/badge";
import Image from "next/image";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import Link from "next/link";
import { getPlaceholderImage } from "@/lib/placeholder-images";
// ✅ Importamos el nuevo diálogo de pago
import { CheckoutDialog } from "@/components/checkout-dialog";

export function Cart() {
  const { cart, totalItems, totalPrice, removeFromCart, updateQuantity, clearCart } = useCart();
  const [isOpen, setIsOpen] = useState(false); // Controla el carrito lateral (Sheet)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false); // Controla el modal de pago (Dialog)

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
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
        <SheetContent className="flex flex-col w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" /> Mi Carrito ({totalItems})
            </SheetTitle>
          </SheetHeader>
          
          <div className="flex-1 overflow-hidden py-4">
            {cart.length > 0 ? (
                <ScrollArea className="h-full pr-4">
                <div className="space-y-4">
                    {cart.map(item => (
                    <div key={item.id} className="flex items-start gap-4 border-b pb-4 last:border-0">
                        <div className="relative h-16 w-16 flex-shrink-0">
                            <Image 
                                src={item.imageUrl || getPlaceholderImage(item.id, 64, 64)} 
                                alt={item.name}
                                fill
                                style={{ objectFit: 'cover' }}
                                className="rounded-md" 
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{item.name}</p>
                        <p className="text-sm text-muted-foreground">${item.price.toFixed(2)}</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                            <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                            <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                        </div>
                        <div className="text-right flex flex-col justify-between h-full">
                            <p className="font-bold text-sm">${(item.price * item.quantity).toFixed(2)}</p>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 self-end" onClick={() => removeFromCart(item.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    ))}
                </div>
                </ScrollArea>
            ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <ShoppingCart className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Tu carrito está vacío.</p>
                <p className="text-sm">¡Explora las tiendas y añade algo rico!</p>
                <Button variant="link" onClick={() => setIsOpen(false)} className="mt-4">
                    Ver Tiendas
                </Button>
                </div>
            )}
          </div>

          {cart.length > 0 && (
            <SheetFooter className="border-t pt-4 sm:flex-col sm:space-x-0 space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Subtotal productos</span>
                        <span>${totalPrice.toFixed(2)}</span>
                    </div>
                    {/* Nota: Los impuestos y envío se calculan en el siguiente paso */}
                    <div className="flex justify-between font-bold text-lg pt-2">
                        <span>Total estimado</span>
                        <span>${totalPrice.toFixed(2)}</span>
                    </div>
                </div>
                <div className="grid gap-2">
                    <Button 
                        className="w-full h-12 text-lg shadow-md" 
                        onClick={() => {
                            setIsOpen(false); // Cerramos el carrito lateral
                            setIsCheckoutOpen(true); // Abrimos el modal de pago
                        }}
                    >
                        Iniciar Pago
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearCart} className="text-muted-foreground">
                        Vaciar Carrito
                    </Button>
                </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* ✅ Componente de Pago (Renderizado fuera del Sheet para evitar problemas de superposición) */}
      <CheckoutDialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen} />
    </>
  )
}