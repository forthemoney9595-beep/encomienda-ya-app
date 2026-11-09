'use client';

import { useState } from "react";
import { money } from '@/lib/format-money';
import { ShoppingCart, Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { useCart } from "@/context/cart-context";
import { Badge } from "./ui/badge";
import Image from "next/image";
import { ScrollArea } from "./ui/scroll-area";
import { getPlaceholderImage } from "@/lib/placeholder-images";
import { PriceTag } from "@/components/price-tag";
// ✅ Importamos el nuevo diálogo de pago
import { CheckoutDialog } from "@/components/checkout-dialog";

export function Cart({ hideTriggerWhenEmpty = false }: { hideTriggerWhenEmpty?: boolean } = {}) {
  const { cart, totalItems, totalPrice, removeFromCart, updateQuantity, clearCart, isCartSheetOpen: isOpen, setCartSheetOpen: setIsOpen } = useCart();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false); // Controla el modal de pago (Dialog)
  // El panel se sigue abriendo desde el contexto (barra flotante de la tienda pública)
  // aunque el botón del encabezado no esté.
  const showTrigger = !hideTriggerWhenEmpty || totalItems > 0;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        {showTrigger && (
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="relative h-10 w-10">
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <Badge className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full p-1 text-xs">
                {totalItems}
              </Badge>
            )}
            <span className="sr-only">Abrir carrito</span>
          </Button>
        </SheetTrigger>
        )}
        <SheetContent className="flex flex-col w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-headline text-3xl font-extrabold">
                Tu pedido <span className="font-body text-base font-normal text-muted-foreground">({totalItems})</span>
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
                        <p className="text-sm text-muted-foreground">{money(item.price)}</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-9 w-9" aria-label={`Quitar uno de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                            <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-6 text-center font-headline text-lg font-extrabold tabular-nums">{item.quantity}</span>
                            <Button variant="outline" size="icon" className="h-9 w-9" aria-label={`Agregar uno de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                            <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        </div>
                        <div className="text-right flex flex-col justify-between h-full">
                            <PriceTag value={item.price * item.quantity} className="text-base" />
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10 self-end" aria-label={`Sacar ${item.name} del carrito`} onClick={() => removeFromCart(item.id)}>
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
                <p className="font-headline text-2xl font-extrabold text-foreground">Todavía no agregaste nada</p>
                <p className="text-sm">Entrá a una tienda y tocá el + de lo que quieras.</p>
                <Button variant="link" onClick={() => setIsOpen(false)} className="mt-4">
                    Ver Tiendas
                </Button>
                </div>
            )}
          </div>

          {/* FE-C-004: era SheetFooter, que en celular es flex-col-reverse y ponía el botón de seguir ANTES del subtotal */}
          {cart.length > 0 && (
            <div className="border-t pt-4 space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Subtotal productos</span>
                        <span>{money(totalPrice)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg pt-2">
                        <span>Subtotal</span>
                        <span className="text-primary">{money(totalPrice)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">El envío y la tarifa de servicio se calculan al pagar.</p>
                </div>
                <div className="grid gap-2">
                    <Button 
                        className="w-full h-12 text-lg shadow-md" 
                        onClick={() => {
                            setIsOpen(false); // Cerramos el carrito lateral
                            setIsCheckoutOpen(true); // Abrimos el modal de pago
                        }}
                    >
                        Continuar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearCart} className="text-muted-foreground">
                        Vaciar carrito
                    </Button>
                </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ✅ Componente de Pago (Renderizado fuera del Sheet para evitar problemas de superposición) */}
      <CheckoutDialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen} />
    </>
  )
}