'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, MapPin, ShoppingBag, LocateFixed, Crosshair, AlertTriangle } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { OrderService } from '@/lib/order-service';
import { authedFetch } from '@/lib/authed-fetch';
// ✅ IMPORTANTE: Agregamos useDoc y useMemoFirebase para leer la config
import { useFirestore, useDoc, useMemoFirebase } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

// Fallback si config/platform.deliveryFee no está cargado (mismo default que el resto
// de la app, ver DEFAULT_DELIVERY_FEE en /api/orders/create).
const DEFAULT_SHIPPING_COST = 2000;

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

  // Direcciones guardadas en el perfil (con su GPS ya cargado desde /profile) -- así,
  // igual que Rappi/PedidosYa, no hace falta volver a pedir GPS en cada compra: se
  // reusa el de la dirección elegida. 'new' = cargar una ubicación nueva a mano (flujo
  // de siempre: GPS en el momento + referencia escrita).
  const savedAddresses = (userProfile as any)?.addresses as
    { id: string; street: string; city?: string; coords?: { latitude: number; longitude: number } }[] | undefined;
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');

  // Estados de Tienda
  const [storeName, setStoreName] = useState('Tienda');
  const [storeAddress, setStoreAddress] = useState('Dirección de la tienda');
  const [storeMaintenanceMode, setStoreMaintenanceMode] = useState(false);

  // 🔒 Clave de idempotencia: una por apertura del diálogo, evita pedidos duplicados
  // por doble click — igual que en checkout/page.tsx
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  // Estados de UI
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // --- 💰 LOGICA FINANCIERA (NUEVA) ---
  // 1. Obtener Configuración Global (Fee %)
  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
  const { data: globalConfig } = useDoc<{ serviceFee?: number; maintenanceMode?: boolean; deliveryFee?: number }>(configRef);
  const shippingCost = globalConfig?.deliveryFee ?? DEFAULT_SHIPPING_COST;

  // 2. Calcular Totales Exactos
  const { serviceFeeAmount, finalTotal } = useMemo(() => {
    const feePercentage = globalConfig?.serviceFee || 0;
    const fee = (cartSubtotal * feePercentage) / 100;
    const total = cartSubtotal + fee + shippingCost;

    return {
        serviceFeeAmount: fee,
        finalTotal: total
    };
  }, [cartSubtotal, globalConfig, shippingCost]);


  useEffect(() => {
    const fetchStoreDetails = async () => {
        if (storeId && firestore) {
            try {
                const storeDoc = await getDoc(doc(firestore, 'stores', storeId));
                if (storeDoc.exists()) {
                    const data = storeDoc.data();
                    setStoreName(data.name || 'Tienda');
                    setStoreAddress(data.address || 'Dirección no disponible');
                    setStoreMaintenanceMode(!!data.maintenanceMode);
                }
            } catch (error) {
                console.error("Error buscando tienda:", error);
            }
        }
    };

    if (open) fetchStoreDetails();
  }, [storeId, firestore, open]);

  // Al abrir el diálogo, si hay una dirección guardada con GPS, la pre-seleccionamos --
  // así el caso común (comprar a la dirección de siempre) no pide nada extra.
  useEffect(() => {
    if (!open) return;
    const firstWithCoords = savedAddresses?.find(a => a.coords);
    if (firstWithCoords) {
      selectAddress(firstWithCoords.id);
    } else {
      selectAddress('new');
    }
    // Solo al abrir -- no queremos pisar la elección del usuario mientras completa el form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectAddress = (id: string) => {
    setSelectedAddressId(id);
    if (id === 'new') {
      setAddress('');
      setLocationCoords(null);
      setLocationStatus('idle');
      return;
    }
    const saved = savedAddresses?.find(a => a.id === id);
    if (!saved) return;
    setAddress(saved.street + (saved.city ? `, ${saved.city}` : ''));
    if (saved.coords) {
      setLocationCoords(saved.coords);
      setLocationStatus('success');
    } else {
      // Dirección guardada sin GPS (se pudo guardar así desde /profile) -- todavía hace
      // falta capturarlo una vez, pero al menos no perdemos la referencia escrita.
      setLocationCoords(null);
      setLocationStatus('idle');
    }
  };

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

    if (globalConfig?.maintenanceMode || storeMaintenanceMode) {
        toast({ variant: "destructive", title: "Lo sentimos", description: "No se pueden realizar pedidos en este momento." });
        return;
    }

    // 🔒 BLOQUEAR SI EMAIL NO VERIFICADO (igual que en checkout/page.tsx)
    if (!user.emailVerified) {
        toast({
            variant: "destructive",
            title: "Email no verificado",
            description: "Verificá tu correo electrónico antes de realizar un pedido. Revisá tu bandeja de entrada.",
        });
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
        const response = await authedFetch('/api/orders/create', user, {
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
            customerPhoneNumber: phone || 'Sin teléfono',
            idempotencyKey
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
                <div className="mx-auto w-16 h-16 bg-success/15 rounded-full flex items-center justify-center mb-4 animate-in zoom-in duration-300">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <DialogTitle className="text-2xl font-bold text-success">¡Solicitud Enviada!</DialogTitle>
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

            {/* DIRECCIONES GUARDADAS: si ya tenés una con GPS cargado, no hace falta
                volver a pedirlo -- mismo patrón que Rappi/PedidosYa (la dirección
                guardada es la fuente de verdad, el GPS solo se usa para armarla). */}
            {savedAddresses && savedAddresses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {savedAddresses.map(addr => (
                        <button
                            key={addr.id}
                            type="button"
                            onClick={() => selectAddress(addr.id)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                                selectedAddressId === addr.id
                                    ? 'border-primary bg-primary/10 text-primary font-medium'
                                    : 'border-border hover:border-primary/50'
                            }`}
                        >
                            <MapPin className="h-3 w-3" />
                            {addr.street}
                            {!addr.coords && <AlertTriangle className="h-3 w-3 text-warning" />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => selectAddress('new')}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            selectedAddressId === 'new'
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-border hover:border-primary/50'
                        }`}
                    >
                        + Nueva ubicación
                    </button>
                </div>
            )}

            {/* BOTÓN GPS: solo hace falta si la dirección elegida no trae GPS ya cargado
                (ubicación nueva, o una guardada sin coords). */}
            {locationStatus !== 'success' && (
                <Button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    variant="default"
                    className="w-full justify-start bg-info hover:bg-info/90 text-info-foreground"
                >
                    {isLocating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Obteniendo GPS...</>
                    ) : (
                        <><Crosshair className="mr-2 h-4 w-4"/> 📍 Usar mi ubicación actual (Obligatorio)</>
                    )}
                </Button>
            )}
            {locationStatus === 'success' && (
                <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-md px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {selectedAddressId !== 'new' ? 'Usando el GPS de tu dirección guardada.' : 'Ubicación guardada correctamente.'}
                </div>
            )}

            {locationStatus === 'error' && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> No pudimos obtener tu ubicación. Activa el GPS.</p>
            )}

            {/* INPUT REFERENCIA VISUAL */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground ml-1">Referencias visuales (Casa, portón, etc)</label>
                <Input
                    placeholder="Ej: Casa blanca rejas negras, frente a plaza."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                />
            </div>

            <Input
                placeholder="Teléfono de contacto"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="bg-info/10 p-4 rounded-lg border border-info/30 flex items-start gap-3">
              <ShoppingBag className="h-5 w-5 text-info mt-0.5 shrink-0" />
              <div>
                  <p className="font-bold text-foreground text-sm">Primero confirmamos Stock</p>
                  <p className="text-xs text-muted-foreground mt-1">
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
                <span>${shippingCost.toLocaleString()}</span>
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