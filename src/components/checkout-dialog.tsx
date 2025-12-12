'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, MapPin, ShoppingBag, LocateFixed } from 'lucide-react'; // Agregamos LocateFixed
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { OrderService } from '@/lib/order-service';
import { useFirestore } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore'; 
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const { cart: items, storeId, totalPrice: cartSubtotal, clearCart } = useCart();
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  // Estados de Formulario
  const [address, setAddress] = useState(''); 
  const [phone, setPhone] = useState(userProfile?.phoneNumber || '');
  
  // ✅ NUEVO: Estado para guardar coordenadas GPS
  const [locationCoords, setLocationCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Estados de Tienda
  const [storeName, setStoreName] = useState('Tienda');
  const [storeAddress, setStoreAddress] = useState('Dirección de la tienda');

  // Estados de UI
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { total } = OrderService.calculateTotals(cartSubtotal);

  useEffect(() => {
    const fetchStoreDetails = async () => {
        if (storeId && firestore) {
            try {
                const storeDoc = await getDoc(doc(firestore, 'stores', storeId));
                if (storeDoc.exists()) {
                    const data = storeDoc.data();
                    setStoreName(data.name || 'Tienda');
                    setStoreAddress(data.address || 'Dirección no disponible');
                }
            } catch (error) {
                console.error("Error buscando tienda:", error);
            }
        }
    };

    if (open) fetchStoreDetails();
  }, [storeId, firestore, open]);

  // ✅ NUEVA FUNCION: Obtener GPS del navegador
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
        toast({ variant: "destructive", title: "Error", description: "Tu navegador no soporta geolocalización." });
        return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            setLocationCoords({ latitude, longitude });
            // Rellenamos el input visualmente para que el usuario sepa que funcionó
            setAddress("📍 Ubicación GPS Actual"); 
            setIsLocating(false);
            toast({ title: "Ubicación detectada", description: "Coordenadas guardadas correctamente." });
        },
        (error) => {
            console.error("Error GPS:", error);
            setIsLocating(false);
            toast({ variant: "destructive", title: "Error GPS", description: "No pudimos obtener tu ubicación. Escríbela manualmente." });
        },
        { enableHighAccuracy: true }
    );
  };

  const handleRequestOrder = async () => {
    if (!user || !storeId || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Debes iniciar sesión." });
        return;
    }
    if (!address) {
        toast({ variant: "destructive", title: "Falta dirección", description: "Ingresa la dirección de entrega." });
        return;
    }

    setIsProcessing(true);

    try {
        // ⚠️ MANTENEMOS LA LIMPIEZA DE PRECIOS (NO TOCAR)
        const cleanItems = items.map((i: any) => ({
            id: i.id,
            title: i.name || i.title || 'Producto',
            price: Number(i.price || i.unit_price || 0), 
            quantity: Number(i.quantity || 1)
        }));

        if (cleanItems.some(i => i.price <= 0)) {
            throw new Error("Hay productos con precio inválido (0). Revisa tu carrito.");
        }

        // Enviamos a la API
        const response = await fetch('/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.uid,
                items: cleanItems,
                storeId: storeId,
                storeName: storeName,
                storeAddress: storeAddress,
                shippingInfo: {
                    name: userProfile?.name || user.displayName || 'Cliente',
                    address: address // Texto visual
                },
                // ✅ ENVIAMOS LAS COORDENADAS (Esto activa el mapa)
                customerCoords: locationCoords, 
                
                customerName: userProfile?.name || user.displayName || 'Cliente',
                customerPhoneNumber: phone || 'Sin teléfono'
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Error al crear pedido");
        }

        setIsSuccess(true);
        clearCart();
        
        setTimeout(() => {
            onOpenChange(false);
            setIsSuccess(false);
            // Limpiamos estados locales
            setAddress('');
            setLocationCoords(null);
            
            if (result.orderId) {
                router.push(`/orders/${result.orderId}`); 
            } else {
                router.push('/orders');
            }
        }, 2500);

    } catch (error: any) {
        console.error("Error en checkout:", error);
        toast({ variant: "destructive", title: "Error al procesar", description: error.message });
    } finally {
        setIsProcessing(false);
    }
  };

  if (isSuccess) {
      return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-md text-center py-10">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-in zoom-in duration-300">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <DialogTitle className="text-2xl font-bold text-green-700">¡Solicitud Enviada!</DialogTitle>
                <DialogDescription>
                    Pedido enviado a <strong>{storeName}</strong>.
                    <br/>
                    Esperando confirmación de stock.
                </DialogDescription>
            </DialogContent>
        </Dialog>
      );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar Disponibilidad</DialogTitle>
          <DialogDescription>
            Confirmar stock con <span className="font-semibold text-primary">{storeName}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-2">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2"><MapPin className="h-4 w-4"/> Dirección de Entrega</h4>
            
            {/* Input con Botón de GPS integrado */}
            <div className="flex gap-2">
                <Input 
                    placeholder="Dirección exacta" 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)} 
                    className="bg-muted/30 flex-1" 
                />
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleGetLocation} 
                    disabled={isLocating}
                    title="Usar mi ubicación actual"
                    className="shrink-0"
                >
                    {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-blue-600" />}
                </Button>
            </div>
            {locationCoords && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Coordenadas GPS listas para el mapa</p>}

            <Input placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-muted/30" />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex items-start gap-3">
              <ShoppingBag className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                  <p className="font-bold text-blue-900 text-sm">Primero confirmamos Stock</p>
                  <p className="text-xs text-blue-700 mt-1">
                      Al solicitar, la tienda verificará si tiene los productos. Luego podrás pagar.
                  </p>
              </div>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm border">
            <div className="flex justify-between font-bold text-base text-primary"><span>Total Estimado</span><span>${total.toLocaleString()}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleRequestOrder} className="w-full h-12 text-lg font-bold" disabled={isProcessing}>
            {isProcessing ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Enviando...</>
            ) : (
                `Solicitar a Tienda`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}