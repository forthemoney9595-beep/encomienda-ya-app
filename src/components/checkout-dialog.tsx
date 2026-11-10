'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { money } from '@/lib/format-money';
import * as Sentry from '@sentry/nextjs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, MapPin, ShoppingBag, Crosshair, AlertTriangle } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { authedFetch } from '@/lib/authed-fetch';
// ✅ IMPORTANTE: Agregamos useDoc y useMemoFirebase para leer la config
import { useFirestore, useDoc, useMemoFirebase } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { capturePosition, formatDistance, type GeoCoords } from '@/lib/geo';
import { LocationPicker } from '@/components/location-picker';
import { deliveryDistanceMeters, computeDeliveryFee, isBeyondDeliveryLimit, type DeliveryPricingConfig } from '@/lib/delivery-pricing';
import { cn } from '@/lib/utils';
import { DIALOG_CLOSE_BIG, DIALOG_SHELL } from '@/components/buyer-motion';

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
  // FE-C-003: error por campo (aria-invalid + mensaje debajo), además del toast.
  const [fieldErrors, setFieldErrors] = useState<{ phone?: boolean; address?: boolean }>({});
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState(''); // Ahora es solo REFERENCIA
  const [phone, setPhone] = useState(userProfile?.phoneNumber || '');

  // Tanda B: el teléfono se capturaba UNA vez en el useState inicial — si el perfil
  // llegaba después del primer render (lo normal), quedaba vacío para siempre. Mismo
  // patrón de sincronización que la foto de perfil (no pisa lo que el usuario tipeó).
  useEffect(() => {
    if (userProfile?.phoneNumber) {
      setPhone(prev => prev || userProfile.phoneNumber || '');
    }
  }, [userProfile?.phoneNumber]);
  
  // ✅ Estado para guardar coordenadas GPS
  const [locationCoords, setLocationCoords] = useState<GeoCoords | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  // Pin manual sin GPS (Fase RR): si el permiso está denegado o el GPS falla, el mapa
  // con pin ajustable es un camino alternativo VÁLIDO — antes "sin GPS no hay pedido".
  const [showManualMap, setShowManualMap] = useState(false);
  const successTimeoutRef = useRef<number | null>(null);
  useEffect(() => () => { if (successTimeoutRef.current) window.clearTimeout(successTimeoutRef.current); }, []);

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
  const [storeCoords, setStoreCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // 🔒 Clave de idempotencia: UNA POR APERTURA del diálogo, evita pedidos duplicados
  // por doble click (este diálogo es el único checkout desde la Fase PP).
  // 🚨 BUG REAL de la gran prueba: antes se generaba una sola vez por MONTAJE — y este
  // componente vive montado en el shell (cart.tsx) toda la sesión. El SEGUNDO pedido de
  // la misma sesión (ej: "Volver a pedir") viajaba con la MISMA clave, el servidor lo
  // trataba como duplicado del primero y lo descartaba en silencio devolviendo el pedido
  // viejo. El useEffect de apertura (abajo) la regenera en cada open.
  const genIdempotencyKey = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [idempotencyKey, setIdempotencyKey] = useState(genIdempotencyKey);

  // Estados de UI
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // --- 💰 LOGICA FINANCIERA (NUEVA) ---
  // 1. Obtener Configuración Global (Fee %)
  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
  const { data: globalConfig } = useDoc<{ serviceFee?: number; maintenanceMode?: boolean } & DeliveryPricingConfig>(configRef);

  // Envío según distancia (Fase RR ter): misma fórmula que /api/orders/create
  // (delivery-pricing.ts). Con la tarifa por km desactivada es el fijo de siempre.
  // Se recalcula en vivo al mover el pin. El servidor recalcula igual: esto es estimación.
  const { shippingCost, deliveryDistM, outOfZone } = useMemo(() => {
    const dist = deliveryDistanceMeters(storeCoords, locationCoords);
    return {
      deliveryDistM: dist,
      outOfZone: isBeyondDeliveryLimit(dist, globalConfig || {}),
      shippingCost: computeDeliveryFee(dist, globalConfig || {}, DEFAULT_SHIPPING_COST),
    };
  }, [storeCoords, locationCoords, globalConfig]);

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
                    // Para estimar el envío por distancia (misma fórmula que el servidor).
                    setStoreCoords(data.coords || data.location || null);
                }
            } catch (error) {
                console.error("Error buscando tienda:", error);
                Sentry.captureException(error, { tags: { component: "checkout-dialog", stage: "fetch-store" } });
            }
        }
    };

    if (open) fetchStoreDetails();
  }, [storeId, firestore, open]);

  // Al abrir el diálogo, si hay una dirección guardada con GPS, la pre-seleccionamos --
  // así el caso común (comprar a la dirección de siempre) no pide nada extra.
  useEffect(() => {
    if (!open) return;
    // Clave de idempotencia NUEVA en cada apertura (ver comentario en su declaración).
    setIdempotencyKey(genIdempotencyKey());
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
    setShowManualMap(false);
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

  // ✅ Obtener GPS del navegador (Fase RR: captura compartida de geo.ts — con timeout,
  // mensajes por tipo de error y guardando la precisión reportada).
  const handleGetLocation = async () => {
    setIsLocating(true);
    try {
        const coords = await capturePosition();
        setLocationCoords(coords);
        setLocationStatus('success');
        toast({ title: "Ubicación detectada", description: "Verificá el pin en el mapa y ajustalo si hace falta." });
    } catch (error: any) {
        console.error("Error GPS:", error);
        setLocationStatus('error');
        toast({ variant: "destructive", title: "Error GPS", description: error.message });
    } finally {
        setIsLocating(false);
    }
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

    // 🔒 BLOQUEAR SI EMAIL NO VERIFICADO
    if (!user.emailVerified) {
        toast({
            variant: "destructive",
            title: "Email no verificado",
            description: "Verificá tu correo electrónico antes de realizar un pedido. Revisá tu bandeja de entrada.",
        });
        return;
    }

    // 🔒 VALIDACIÓN ESTRICTA DE UBICACIÓN (GPS o pin marcado a mano en el mapa)
    if (!locationCoords) {
        toast({
            variant: "destructive",
            title: "Falta tu Ubicación",
            description: "Usá 'Usar mi ubicación actual' o marcá tu casa en el mapa para que el delivery sepa dónde ir."
        });
        return;
    }

    // 🚧 Cerco anti-disparate (el servidor rechaza igual — esto evita el viaje redondo)
    if (outOfZone) {
        toast({
            variant: "destructive",
            title: "Ubicación fuera de la zona de entrega",
            description: "El pin quedó muy lejos de la tienda. Revisalo en el mapa — puede que el GPS haya marcado otro lugar."
        });
        return;
    }

    // 🔒 TELÉFONO OBLIGATORIO PARA PEDIR (decisión de David, 18/8): sin un número de
    // contacto el repartidor no tiene plan B en la puerta. Para cuentas registradas
    // viene precargado (invisible); cubre a las cuentas de Google/viejas que no tienen.
    // El servidor lo exige igual (defensa doble en /api/orders/create).
    if (phone.replace(/\D/g, '').length < 8) {
        setFieldErrors({ phone: true });
        phoneRef.current?.focus();
        toast({
            variant: "destructive",
            title: "Falta tu teléfono",
            description: "Ingresá un número de contacto válido (con código de área) para coordinar la entrega.",
        });
        return;
    }

    if (!address.trim()) {
        setFieldErrors({ address: true });
        addressRef.current?.focus();
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
            customerPhoneNumber: phone,
            idempotencyKey
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Error al crear pedido");
        }

        setIsSuccess(true);
        clearCart();

        // Backfill del teléfono al perfil (pedido de David, 18/8): el teléfono es
        // obligatorio al registrarse, pero las cuentas viejas y las creadas con Google
        // no lo tienen — si el perfil está VACÍO y acá se escribió uno, se guarda para
        // la próxima. Nunca pisa el teléfono registrado (puede ser el de quien recibe).
        if (!userProfile?.phoneNumber && phone.trim() && user && firestore) {
            updateDoc(doc(firestore, 'users', user.uid), { phoneNumber: phone.trim() })
                .catch(() => { /* mejor esfuerzo: el pedido ya salió bien */ });
        }

        // Tanda B: timeout con referencia para limpiarlo si el componente se desmonta
        // antes de los 2,5 s (setState tras unmount + navegación fantasma).
        successTimeoutRef.current = window.setTimeout(() => {
            onOpenChange(false);
            setIsSuccess(false);
            // Limpiamos estados locales
            setAddress('');
            setLocationCoords(null);
            setLocationStatus('idle');
            setShowManualMap(false);

            if (result.orderId) {
                router.push(`/orders/${result.orderId}`); 
            } else {
                router.push('/orders');
            }
        }, 2500);

    } catch (error: any) {
        console.error("Error en checkout:", error);
        Sentry.captureException(error, { tags: { component: "checkout-dialog", stage: "submit" } });
        toast({ variant: "destructive", title: "Error al procesar", description: error.message });
    } finally {
        setIsProcessing(false);
    }
  };

  if (isSuccess) {
      return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className={cn('sm:max-w-md text-center py-10', DIALOG_SHELL)}>
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-success/15 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
                    <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
                </div>
                <DialogTitle className="font-headline text-3xl font-extrabold">Pedido enviado</DialogTitle>
                <DialogDescription>
                    <strong>{storeName}</strong> está revisando que tenga todo.
                    <br/>
                    Cuando confirme, te avisamos para que pagues.
                </DialogDescription>
            </DialogContent>
        </Dialog>
      );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* FE-C-003 (auditoría oct 2026): el diálogo medía más que la pantalla (981/808 px) y el
          botón + el total quedaban bajo el fold incluso en escritorio. Ahora el cuerpo scrollea
          y el footer con el total es fijo. */}
      <DialogContent className={cn('sm:max-w-md max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0', DIALOG_SHELL, DIALOG_CLOSE_BIG)}>
        <DialogHeader className="px-6 pb-2 pr-14 pt-6 text-left">
          {/* Rediseño 2, Tanda 0: "Solicitar Disponibilidad" / "Solicitar a Tienda" eran
              palabras del sistema. El cliente hace un pedido; que la tienda confirme antes de
              cobrar se explica en la bajada. */}
          <DialogTitle className="font-headline text-3xl font-extrabold leading-none">Tu pedido a {storeName}</DialogTitle>
          <DialogDescription>
            Primero la tienda confirma que tiene todo. Recién ahí pagás.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
        
        <div className="grid gap-4 py-2">
          
          {/* SECCIÓN DE DIRECCIÓN Y GPS */}
          {/* Vidrio (9/11/2026): secciones en paneles suaves redondeados (antes cajas con borde). */}
          <div className="space-y-3 rounded-card bg-foreground/[0.04] p-4">
            <h4 className="flex items-center gap-2.5 font-headline text-xl font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10"><MapPin className="h-4 w-4 text-primary" aria-hidden="true"/></span> ¿Dónde entregamos?</h4>

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
                            aria-pressed={selectedAddressId === addr.id}
                            className={`flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                                selectedAddressId === addr.id
                                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                    : 'border-border bg-popover hover:border-primary/50'
                            }`}
                        >
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {addr.street}
                            {!addr.coords && <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="Sin GPS cargado" />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => selectAddress('new')}
                        aria-pressed={selectedAddressId === 'new'}
                        className={`min-h-[40px] rounded-full border px-3.5 text-sm transition-colors ${
                            selectedAddressId === 'new'
                                ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                : 'border-border bg-popover hover:border-primary/50'
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
                    className="h-12 w-full justify-start rounded-full bg-info text-info-foreground hover:bg-info/90"
                >
                    {isLocating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Obteniendo GPS...</>
                    ) : (
                        <><Crosshair className="mr-2 h-4 w-4"/> Usar mi ubicación actual</>
                    )}
                </Button>
            )}
            {locationStatus === 'success' && (
                <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {selectedAddressId !== 'new' ? 'Usando el GPS de tu dirección guardada.' : 'Ubicación marcada correctamente.'}
                </div>
            )}

            {locationStatus === 'error' && (
                <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0"/> No pudimos obtener tu ubicación. Podés marcarla a mano en el mapa.</p>
            )}

            {/* PIN AJUSTABLE (Fase RR): si hay coords (del GPS o de la dirección guardada)
                se muestra el mapa para VERIFICAR y corregir arrastrando — la lectura cruda
                del GPS puede errarle por cuadras si triangula por WiFi. Si no hay coords,
                un link abre el mapa para marcar a mano (camino alternativo sin GPS). */}
            {(locationCoords || showManualMap) ? (
                <LocationPicker
                    value={locationCoords}
                    onChange={(c) => { setLocationCoords(c); setLocationStatus('success'); }}
                    className="h-44"
                    hint={locationCoords
                        ? 'Verificá que el pin esté en tu entrada. Podés arrastrarlo o tocar el mapa para corregirlo.'
                        : 'Tocá el mapa donde está tu casa para colocar el pin.'}
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setShowManualMap(true)}
                    className="min-h-[44px] w-full text-left text-sm font-semibold text-info underline underline-offset-2"
                >
                    ¿Sin GPS? Marcá tu ubicación a mano en el mapa
                </button>
            )}

            {/* 🚧 Cerco anti-disparate: el pin quedó absurdamente lejos (GPS erróneo) */}
            {outOfZone && (
                <p className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    El pin quedó muy lejos de la tienda ({deliveryDistM ? formatDistance(deliveryDistM) : ''}). Revisalo — puede que el GPS haya marcado otro lugar.
                </p>
            )}

            {/* INPUT REFERENCIA VISUAL */}
            <div className="space-y-1">
                <label htmlFor="checkout-address" className="ml-1 text-sm font-medium text-muted-foreground">Referencias visuales (Casa, portón, etc)</label>
                <Input
                    id="checkout-address"
                    ref={addressRef}
                    placeholder="Ej: Casa blanca rejas negras, frente a plaza."
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); if (fieldErrors.address) setFieldErrors({}); }}
                    aria-invalid={fieldErrors.address || undefined}
                    aria-describedby={fieldErrors.address ? 'checkout-address-error' : undefined}
                    className={cn('h-12 rounded-xl bg-popover', fieldErrors.address && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.address && <p id="checkout-address-error" className="ml-1 text-sm text-destructive">Escribí una referencia de tu casa (ej: portón negro).</p>}
            </div>

            <div className="space-y-1">
                <label htmlFor="checkout-phone" className="ml-1 text-sm font-medium text-muted-foreground">Teléfono de contacto para la entrega</label>
                <Input
                    id="checkout-phone"
                    ref={phoneRef}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Ej: 3837 123456"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); if (fieldErrors.phone) setFieldErrors({}); }}
                    aria-invalid={fieldErrors.phone || undefined}
                    aria-describedby={fieldErrors.phone ? 'checkout-phone-error' : undefined}
                    className={cn('h-12 rounded-xl bg-popover', fieldErrors.phone && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.phone && <p id="checkout-phone-error" className="ml-1 text-sm text-destructive">Ingresá un número válido con código de área (mínimo 8 dígitos).</p>}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-card bg-info/10 p-4">
              <ShoppingBag className="h-5 w-5 text-info mt-0.5 shrink-0" />
              <div>
                  <p className="font-bold text-foreground">Primero la tienda confirma</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                      Al hacer el pedido, la tienda revisa que tenga todo. Después te avisamos para que pagues.
                  </p>
              </div>
          </div>

          {/* ✅ DESGLOSE DE PRECIO EXACTO */}
          <div className="space-y-2 rounded-card bg-foreground/[0.04] p-4 text-sm">
             <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{money(cartSubtotal)}</span>
             </div>
             <div className="flex justify-between text-muted-foreground">
                <span>
                    Envío
                    {/* Con tarifa por km activa: el checkout estima con la línea recta (gratis, al
                        instante); el monto final lo calcula el servidor con la distancia POR RUTA
                        al crear el pedido (9/11), y puede ser algo mayor. Por eso "desde". */}
                    {(globalConfig?.deliveryFeePerKm ?? 0) > 0 && deliveryDistM != null && (
                        <span className="text-xs"> (desde, ≈ {formatDistance(deliveryDistM)}; se ajusta por ruta)</span>
                    )}
                </span>
                <span>{money(shippingCost)}</span>
             </div>
             {serviceFeeAmount > 0 && (
                 <div className="flex justify-between text-muted-foreground">
                    <span>Servicio</span>
                    <span>{money(serviceFeeAmount)}</span>
                 </div>
             )}
             
             <div className="mt-2 flex justify-between border-t border-dashed border-border pt-2 text-base font-bold">
                <span>Total estimado</span>
                <span className="tabular-nums">{money(finalTotal)}</span>
            </div>
          </div>
        </div>

        </div>
        {/* Pie fijo con el total y la acción (vidrio 9/11/2026: mismo fondo que el diálogo,
            antes bg-background lo pintaba de otro gris en modo claro). */}
        <DialogFooter className="flex-col gap-3 border-t border-border/60 bg-popover px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-col sm:space-x-0">
          <div className="flex w-full items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total estimado</span>
            <span className="font-headline text-3xl font-extrabold tabular-nums">{money(finalTotal)}</span>
          </div>
          <Button onClick={handleRequestOrder} className="h-12 w-full rounded-full text-lg font-bold" disabled={isProcessing}>
            {isProcessing ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Enviando...</>
            ) : (
                'Hacer el pedido'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}