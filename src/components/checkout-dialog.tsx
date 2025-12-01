'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CreditCard, Wallet, Loader2, CheckCircle2, Receipt, MapPin } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { createOrder, OrderService } from '@/lib/order-service';
import { useFirestore } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  // ✅ FIX 1: Renombramos 'cart' a 'items' aquí mismo para no romper el resto del código
  const { cart: items, storeId, totalPrice: cartSubtotal, clearCart } = useCart();
  
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Tarjeta'>('Tarjeta');
  
  // ✅ FIX 2: Quitamos 'userProfile?.address' porque esa propiedad no existe en la interfaz. 
  // Iniciamos vacío para que el usuario escriba.
  const [address, setAddress] = useState(''); 
  
  const [phone, setPhone] = useState(userProfile?.phoneNumber || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Calcular montos con la lógica centralizada
  const { subtotal, serviceFee, deliveryFee, total } = OrderService.calculateTotals(cartSubtotal);

  const handlePayment = async () => {
    if (!user || !storeId || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Debes iniciar sesión para comprar." });
        return;
    }

    if (!address) {
        toast({ variant: "destructive", title: "Falta dirección", description: "Por favor ingresa dónde entregamos el pedido." });
        return;
    }

    setIsProcessing(true);

    setTimeout(async () => {
      try {
        await createOrder(firestore, {
          userId: user.uid,
          customerName: userProfile?.name || user.displayName || 'Cliente',
          customerPhoneNumber: phone || 'Sin teléfono',
          storeId: storeId,
          storeName: 'Tienda EncomiendaYA', 
          storeAddress: 'Ubicación de Tienda',
          // ✅ FIX 3: Al arreglar 'items' arriba, 'i' ya no da error de tipo 'any'
          items: items.map(i => ({
              id: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity || 1,
              imageUrl: i.imageUrl
          })),
          shippingInfo: {
              name: userProfile?.name || 'Cliente',
              address: address
          },
          subtotal,
          deliveryFee,
          serviceFee,
          total,
          paymentMethod
        });

        setIsSuccess(true);
        clearCart();
        
        setTimeout(() => {
            onOpenChange(false);
            setIsSuccess(false);
            router.push('/orders'); 
        }, 2500);

      } catch (error) {
        console.error(error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo procesar el pedido." });
        setIsProcessing(false);
      }
    }, 1500);
  };

  if (isSuccess) {
      return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-md text-center py-10">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-in zoom-in duration-300">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <DialogTitle className="text-2xl font-bold text-green-700">¡Pedido Confirmado!</DialogTitle>
                <DialogDescription>
                    Tu orden ha sido enviada a la tienda. <br/>
                    Te avisaremos cuando esté en camino.
                </DialogDescription>
            </DialogContent>
        </Dialog>
      );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar Pedido</DialogTitle>
          <DialogDescription>
            Completa los datos de entrega y pago.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          
          {/* Datos de Entrega */}
          <div className="space-y-3 border-b pb-4">
            <h4 className="font-medium flex items-center gap-2 text-sm"><MapPin className="h-4 w-4"/> Dirección de Entrega</h4>
            <div className="grid gap-2">
                <Label htmlFor="address" className="sr-only">Dirección</Label>
                <Input 
                    id="address" 
                    placeholder="Calle y número, Piso, Depto..." 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                />
                <Input 
                    id="phone" 
                    placeholder="Teléfono de contacto (opcional)" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
            </div>
          </div>

          {/* Resumen Financiero */}
          <div className="bg-muted/40 p-4 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
                <span className="text-muted-foreground">Productos ({items.length})</span>
                <span>${subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-muted-foreground">Envío</span>
                <span>${deliveryFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                    Tarifa de Servicio (5%)
                    <Receipt className="h-3 w-3" />
                </span>
                <span>${serviceFee.toLocaleString()}</span>
            </div>
            <div className="border-t border-muted-foreground/20 pt-2 mt-2 flex justify-between font-bold text-lg text-primary">
                <span>Total a Pagar</span>
                <span>${total.toLocaleString()}</span>
            </div>
          </div>

          {/* Selección de Método de Pago */}
          <div className="space-y-3">
            <Label>Método de Pago</Label>
            <RadioGroup defaultValue="Tarjeta" onValueChange={(v: any) => setPaymentMethod(v)} className="grid grid-cols-2 gap-4">
              <div>
                <RadioGroupItem value="Tarjeta" id="card" className="peer sr-only" />
                <Label
                  htmlFor="card"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                >
                  <CreditCard className="mb-3 h-6 w-6" />
                  Tarjeta
                </Label>
              </div>
              <div>
                <RadioGroupItem value="Efectivo" id="cash" className="peer sr-only" />
                <Label
                  htmlFor="cash"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                >
                  <Wallet className="mb-3 h-6 w-6" />
                  Efectivo
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handlePayment} className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20" disabled={isProcessing}>
            {isProcessing ? (
                <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Procesando...
                </>
            ) : (
                `Pagar $${total.toLocaleString()}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}