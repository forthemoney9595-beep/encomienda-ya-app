'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, MapPin, ShoppingBag, LocateFixed, Crosshair, AlertTriangle } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { OrderService } from '@/lib/order-service';
// ✅ IMPORTANTE: Agregamos useDoc y useMemoFirebase para leer la config
import { useFirestore, useDoc, useMemoFirebase } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore'; 
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

// ✅ CONFIGURACIÓN CENTRALIZADA DE PRECIO (Igual que en checkout/page.tsx)
const FIXED_SHIPPING_COST = 2000; 

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
  const [address, setAddress] = useState(''); // Ahora es solo REFERENCIA
  const [phone, setPhone] = useState(userProfile?.phoneNumber || '');
  
  // ✅ Estado para guardar coordenadas GPS
  const [locationCoords, setLocationCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Estados de Tienda
  const [storeName, setStoreName] = useState('Tienda');
  const [storeAddress, setStoreAddress] = useState('Dirección de la tienda');

  // Estados de UI
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // --- 💰 LOGICA FINANCIERA (NUEVA) ---
  // 1. Obtener Configuración Global (Fee %)
  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
  const { data: globalConfig } = useDoc<{ serviceFee?: number }>(configRef);

  // 2. Calcular Totales Exactos
  const { serviceFeeAmount, finalTotal } = useMemo(() => {
    const feePercentage = globalConfig?.serviceFee || 0;
    const fee = (cartSubtotal * feePercentage) / 100;
    const shipping = FIXED_SHIPPING_COST; 
    const total = cartSubtotal + fee + shipping;
    
    return {
        serviceFeeAmount: fee,
        finalTotal: total
    };
  }, [cartSubtotal, globalConfig]);


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

  // ✅ FUNCION: Obtener GPS del navegador
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
            setLocationStatus('success');
            setIsLocating(false);
            toast({ title: "Ubicación detectada", description: "Coordenadas guardadas para el mapa." });
        },
        (error) => {
            console.error("Error GPS:", error);
            setIsLocating(false);
            setLocationStatus('error');
            toast({ variant: "destructive", title: "Error GPS", description: "Asegúrate de permitir el acceso a tu ubicación." });
        },
        { enableHighAccuracy: true }
    );
  };

  const handleRequestOrder = async () => {
    if (!user || !storeId || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Debes iniciar sesión." });
        return;
    }

    // 🔒 VALIDACIÓN ESTRICTA DE GPS
    if (!locationCoords) {
        toast({ 
            variant: "destructive", 
            title: "Falta Ubicación GPS", 
            description: "Por favor presiona '📍 Usar mi ubicación actual' para que el delivery sepa dónde ir." 
        });
        return;
    }

    if (!address) {
        toast({ variant: "destructive", title: "Falta Referencia", description: "Escribe un detalle de tu casa (ej: Portón negro)." });
        return;
    }

    setIsProcessing(true);

    try {
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
                    address: address // Enviamos la referencia visual escrita
                },
                // ✅ ENVIAMOS LAS COORDENADAS
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
            setLocationStatus('idle');
            
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
          
          {/* SECCIÓN DE DIRECCIÓN Y GPS */}
          <div className="space-y-3 bg-muted/20 p-4 rounded-xl border">
            <h4 className="font-semibold text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-primary"/> ¿Dónde entregamos?</h4>
            
            {/* BOTÓN GPS */}
            <Button 
                type="button" 
                onClick={handleGetLocation} 
                disabled={isLocating || locationStatus === 'success'}
                variant={locationStatus === 'success' ? 'outline' : 'default'}
                className={`w-full justify-start ${locationStatus === 'success' ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
                {isLocating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Obteniendo GPS...</>
                ) : locationStatus === 'success' ? (
                    <><CheckCircle2 className="mr-2 h-4 w-4"/> Ubicación Guardada Correctamente</>
                ) : (
                    <><Crosshair className="mr-2 h-4 w-4"/> 📍 Usar mi ubicación actual (Obligatorio)</>
                )}
            </Button>
            
            {locationStatus === 'error' && (
                <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> No pudimos obtener tu ubicación. Activa el GPS.</p>
            )}

            {/* INPUT REFERENCIA VISUAL */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground ml-1">Referencias visuales (Casa, portón, etc)</label>
                <Input 
                    placeholder="Ej: Casa blanca rejas negras, frente a plaza." 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)} 
                    // ✅ Mantenemos tu fix de color negro
                    className="bg-white text-black placeholder:text-gray-400" 
                />
            </div>

            <Input 
                placeholder="Teléfono de contacto" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                // ✅ Mantenemos tu fix de color negro
                className="bg-white text-black placeholder:text-gray-400" 
            />
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

          {/* ✅ DESGLOSE DE PRECIO EXACTO */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm border">
             <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>${cartSubtotal.toLocaleString()}</span>
             </div>
             <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span>${FIXED_SHIPPING_COST.toLocaleString()}</span>
             </div>
             {serviceFeeAmount > 0 && (
                 <div className="flex justify-between text-muted-foreground">
                    <span>Servicio</span>
                    <span>${serviceFeeAmount.toLocaleString()}</span>
                 </div>
             )}
             
             <div className="border-t pt-2 mt-2 flex justify-between font-bold text-base text-primary">
                <span>Total Estimado</span>
                <span>${finalTotal.toLocaleString()}</span>
            </div>
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