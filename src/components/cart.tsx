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
import { PricePill } from "@/components/price-pill";
// ✅ Importamos el nuevo diálogo de pago
import { CheckoutDialog } from "@/components/checkout-dialog";
import { buyerMotion, useBumpKey, DIALOG_CLOSE_BIG } from "@/components/buyer-motion";
import { cn } from "@/lib/utils";

export function Cart({ hideTriggerWhenEmpty = false }: { hideTriggerWhenEmpty?: boolean } = {}) {
  const { cart, totalItems, totalPrice, removeFromCart, updateQuantity, clearCart, isCartSheetOpen: isOpen, setCartSheetOpen: setIsOpen } = useCart();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false); // Controla el modal de pago (Dialog)
  // El panel se sigue abriendo desde el contexto (barra flotante de la tienda pública)
  // aunque el botón del encabezado no esté.
  const showTrigger = !hideTriggerWhenEmpty || totalItems > 0;
  // El carrito "rebota" cada vez que se agrega algo (no al quitar). Vidrio, 9/11/2026.
  const bumpKey = useBumpKey(totalItems);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        {showTrigger && (
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" data-testid="cart-trigger" className="relative h-11 w-11 rounded-2xl border-[color:var(--glass-line)] bg-[color:var(--glass)]">
            <span key={bumpKey} className={cn('grid place-items-center', bumpKey > 0 && buyerMotion.bump)}>
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            </span>
            {totalItems > 0 && (
              <Badge key={`b${bumpKey}`} className={cn('absolute -right-2 -top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-[color:var(--glass-line)] p-1 text-xs tabular-nums', bumpKey > 0 && buyerMotion.bump)}>
                {totalItems}
              </Badge>
            )}
            <span className="sr-only">Abrir carrito</span>
          </Button>
        </SheetTrigger>
        )}
        <SheetContent className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-md", DIALOG_CLOSE_BIG)}>
          <SheetHeader className="px-5 pb-3 pt-6">
            <SheetTitle className="flex items-center gap-2 font-headline text-3xl font-extrabold">
                Tu pedido <span className="font-body text-base font-normal text-muted-foreground">({totalItems})</span>
            </SheetTitle>
          </SheetHeader>
          
          <div className="flex-1 overflow-hidden">
            {cart.length > 0 ? (
                <ScrollArea className="h-full px-4">
                <div className="space-y-3 pb-4">
                    {cart.map((item, i) => (
                    // Vidrio (9/11/2026): cada producto en su tarjetita suave (antes, filas
                    // separadas por una línea), con entrada escalonada.
                    <div key={item.id} className="stagger-in flex items-start gap-3 rounded-card bg-foreground/[0.04] p-3" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl">
                            <Image 
                                src={item.imageUrl || getPlaceholderImage(item.id, 64, 64)} 
                                alt={item.name}
                                fill
                                style={{ objectFit: 'cover' }}
                                className="rounded-2xl" 
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                        <p className="font-headline text-lg font-bold leading-tight truncate">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{money(item.price)}</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-10 w-10 rounded-full bg-popover" aria-label={`Quitar uno de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                            <Minus className="h-4 w-4" />
                            </Button>
                            <span key={item.quantity} className={cn('w-6 text-center font-headline text-lg font-extrabold tabular-nums', buyerMotion.tick)}>{item.quantity}</span>
                            <Button variant="outline" size="icon" className="h-10 w-10 rounded-full bg-popover" aria-label={`Agregar uno de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                            <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        </div>
                        <div className="flex h-full flex-col items-end justify-between gap-2 text-right">
                            <PricePill value={item.price * item.quantity} className="text-base" />
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10" aria-label={`Sacar ${item.name} del carrito`} onClick={() => removeFromCart(item.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    ))}
                </div>
                </ScrollArea>
            ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <span className="mb-4 grid h-20 w-20 place-items-center rounded-card bg-primary/10"><ShoppingCart className="h-9 w-9 text-primary" aria-hidden="true" /></span>
                <p className="font-headline text-2xl font-extrabold text-foreground">Todavía no agregaste nada</p>
                <p className="text-sm">Entrá a una tienda y tocá el + de lo que quieras.</p>
                <Button variant="link" onClick={() => setIsOpen(false)} className="mt-4 min-h-[44px]">
                    Ver Tiendas
                </Button>
                </div>
            )}
          </div>

          {/* FE-C-004: era SheetFooter, que en celular es flex-col-reverse y ponía el botón de seguir ANTES del subtotal */}
          {cart.length > 0 && (
            // Pie fijo con el total (vidrio 9/11/2026): la línea "Subtotal productos" repetía el
            // mismo número que "Subtotal"; queda uno solo, grande.
            <div className="space-y-3 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
                <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                        <span className="font-semibold">Subtotal</span>
                        <span className="font-headline text-2xl font-extrabold tabular-nums">{money(totalPrice)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">El envío y la tarifa de servicio se calculan en el paso siguiente.</p>
                </div>
                <div className="grid gap-2">
                    <Button 
                        className="h-12 w-full rounded-full text-lg shadow-md" 
                        onClick={() => {
                            setIsOpen(false); // Cerramos el carrito lateral
                            setIsCheckoutOpen(true); // Abrimos el modal de pago
                        }}
                    >
                        Continuar
                    </Button>
                    <Button variant="ghost" onClick={clearCart} className="min-h-[44px] rounded-full text-muted-foreground">
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