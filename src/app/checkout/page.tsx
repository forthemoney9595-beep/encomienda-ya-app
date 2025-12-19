'use client';

import { useCart } from '@/context/cart-context';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Home, Loader2, Phone, AlertTriangle, ArrowLeft, Store as StoreIcon, Receipt, CreditCard, Lock, MapPin, Crosshair } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase'; 
// ✅ CORRECCIÓN: Agregamos la importación que faltaba
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// ✅ CONFIGURACIÓN DE PRECIO (Tinogasta)
const FIXED_SHIPPING_COST = 2000; 

interface StoreData {
  name: string;
  address: string;
  maintenanceMode?: boolean;
  userId: string;
}

const formSchema = z.object({
  name: z.string().min(3, "El nombre es obligatorio."),
  address: z.string().min(5, "La referencia es obligatoria (ej: Barrio, color de casa)."),
  addressId: z.string().optional(),
});

export default function CheckoutPage() {
  const { cart, totalPrice, totalItems, clearCart, storeId } = useCart();
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientLoaded, setClientLoaded] = useState(false);

  // --- 📍 ESTADO DE GEOLOCALIZACIÓN ---
  const [coords, setCoords] = useState<{latitude: number; longitude: number} | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // --- CONFIGURACIÓN GLOBAL ---
  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
  const { data: globalConfig } = useDoc<{ maintenanceMode: boolean, serviceFee?: number }>(configRef);

  // --- TIENDA ESPECÍFICA ---
  const storeRef = useMemoFirebase(() => (firestore && storeId) ? doc(firestore, 'stores', storeId) : null, [firestore, storeId]);
  const { data: storeData, isLoading: storeLoading } = useDoc<StoreData>(storeRef);

  useEffect(() => {
    setClientLoaded(true);
  }, []);

  // --- CÁLCULOS ---
  const { serviceFeeAmount, shippingCost, finalTotal } = useMemo(() => {
    const feePercentage = globalConfig?.serviceFee || 0;
    const fee = (totalPrice * feePercentage) / 100;
    const shipping = FIXED_SHIPPING_COST; 
    const total = totalPrice + fee + shipping;
    
    return {
        serviceFeeAmount: fee,
        shippingCost: shipping,
        finalTotal: total
    };
  }, [totalPrice, globalConfig]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      addressId: "",
    },
  });
  
  const addressIdValue = form.watch('addressId');

  // Inicializar formulario
  useEffect(() => {
    if (clientLoaded && userProfile && !authLoading) {
        if (!userProfile.phoneNumber || userProfile.phoneNumber.trim() === '') {
            toast({ variant: 'destructive', title: 'Información Faltante', description: 'Por favor, añade tu número de teléfono.' });
            router.push('/profile');
            return;
        }

        form.reset({
            name: userProfile.name || userProfile.displayName || "",
            address: userProfile.addresses?.[0] ? `${userProfile.addresses[0].street}` : "",
            addressId: userProfile.addresses?.[0]?.id || "new",
        });
    }
  }, [userProfile, authLoading, form, clientLoaded, router, toast]);
  
  // Lógica de dropdown de direcciones
  useEffect(() => {
    if(addressIdValue && userProfile?.addresses && addressIdValue !== 'new') {
        const selected = userProfile.addresses.find((a: any) => a.id === addressIdValue);
        if(selected) {
            form.setValue('address', `${selected.street}, ${selected.city}`);
        }
    } else if (addressIdValue === 'new') {
        form.setValue('address', '');
        setCoords(null); 
        setLocationStatus('idle');
    }
  }, [addressIdValue, userProfile?.addresses, form]);

  useEffect(() => {
    if (clientLoaded && !authLoading && !user) router.push('/login');
  }, [clientLoaded, authLoading, user, router]);

  useEffect(() => {
    if (clientLoaded && !authLoading && (totalItems === 0 || !storeId)) {
      router.push('/');
    }
  }, [clientLoaded, authLoading, totalItems, storeId, router]);

  // --- 📍 FUNCIÓN PARA OBTENER GPS ---
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
        toast({ variant: "destructive", title: "Error", description: "Tu navegador no soporta geolocalización." });
        return;
    }

    setLocationStatus('loading');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            setCoords({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            });
            setLocationStatus('success');
            toast({ title: "¡Ubicación detectada!", description: "Coordenadas guardadas correctamente." });
        },
        (error) => {
            console.error(error);
            setLocationStatus('error');
            toast({ variant: "destructive", title: "Error de GPS", description: "No pudimos obtener tu ubicación. Asegúrate de dar permisos." });
        },
        { enableHighAccuracy: true }
    );
  };
  
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (globalConfig?.maintenanceMode || storeData?.maintenanceMode) {
        toast({ variant: "destructive", title: "Lo sentimos", description: "No se pueden realizar pedidos en este momento." });
        return;
    }

    // 🔒 OBLIGAR GPS SI ES NUEVA DIRECCIÓN
    if (addressIdValue === 'new' && !coords) {
        toast({ 
            variant: "destructive", 
            title: "Ubicación Requerida", 
            description: "Por favor, presiona 'Usar mi ubicación actual' para que el repartidor sepa dónde ir." 
        });
        return;
    }

    if (!user || !userProfile || !storeId || !firestore) return;

    setIsSubmitting(true);
    try {
      // 1. Datos de Tienda
      const storeRef = doc(firestore, 'stores', storeId);
      const storeSnap = await getDoc(storeRef);

      if (!storeSnap.exists()) {
        throw new Error("La tienda para este pedido no existe.");
      }
      const currentStoreData = storeSnap.data() as StoreData;

      // 2. Sanitización de Items
      const cleanItems = cart.map((item: any) => {
          const rawPrice = item.price || item.unit_price || item.unitPrice || item.product?.price || 0;
          const parsedPrice = Number(rawPrice);

          return {
            id: item.id,
            title: item.name || item.title || item.productName || 'Producto',
            price: isNaN(parsedPrice) ? 0 : parsedPrice,
            quantity: Number(item.quantity || 1)
          };
      });

      if (cleanItems.some((i: any) => i.price <= 0)) {
          toast({ variant: "destructive", title: "Error en el Carrito", description: "Hay productos con precio inválido." });
          setIsSubmitting(false);
          return;
      }

      // 3. CREAR ORDEN VÍA API SEGURA
      const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              userId: user.uid,
              items: cleanItems,
              storeId: storeId,
              shippingInfo: { name: values.name, address: values.address }, 
              paymentMethod: 'mercadopago',
              customerCoords: coords || undefined 
          })
      });

      const orderDataResult = await createResponse.json();

      if (!createResponse.ok) {
          throw new Error(orderDataResult.error || "Error creando orden segura");
      }

      const newOrderId = orderDataResult.orderId;

      // 4. GENERAR LINK DE PAGO
      const paymentResponse = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: cleanItems,
            orderId: newOrderId,
            userId: user.uid, 
            storeId: storeId,
            storeOwnerId: currentStoreData.userId, 
            payerEmail: user.email || 'guest@encomiendaya.com',
            shippingCost: shippingCost 
        })
      });

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(paymentData.error || "Error al generar pago");
      }

      clearCart(); 
      toast({ title: "Redirigiendo a MercadoPago...", description: "No cierres esta ventana." });
      
      window.location.href = paymentData.url;

    } catch (error: any) {
      console.error(error);
      setIsSubmitting(false); 
      toast({ variant: "destructive", title: "Error", description: error.message || "No se pudo iniciar el pago." });
    }
  }

  // --- UI BLOQUEO MANTENIMIENTO ---
  if (globalConfig?.maintenanceMode || storeData?.maintenanceMode) {
    const isStore = !!storeData?.maintenanceMode;
    return (
        <div className="container mx-auto py-20 flex justify-center items-center">
            <Card className={`max-w-md w-full border-${isStore ? 'orange' : 'red'}-200 bg-${isStore ? 'orange' : 'red'}-50 shadow-lg`}>
                <CardHeader className="text-center pb-2">
                    <CardTitle className={`text-2xl text-${isStore ? 'orange' : 'red'}-800`}>
                        {isStore ? `${storeData?.name} Cerrada` : 'Plataforma en Mantenimiento'}
                    </CardTitle>
                </CardHeader>
                <CardFooter className="justify-center pt-4">
                    <Button variant="outline" onClick={() => router.push('/')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Inicio
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
  }

  if (!clientLoaded || authLoading || !userProfile || storeLoading) {
      return <div className="container mx-auto text-center py-20"><Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" /></div>
  }
  
  const hasAddresses = userProfile.addresses && userProfile.addresses.length > 0;

  return (
    <div className="container mx-auto pb-20">
      <PageHeader title="Finalizar Compra" description="Confirma tu ubicación para el delivery." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* FORMULARIO */}
        <div className="md:col-span-2">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card className="border-l-4 border-l-primary">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Ubicación de Entrega</CardTitle>
                            <CardDescription>Necesitamos tu ubicación exacta para el GPS del repartidor.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            
                            {/* SECCIÓN DATOS PERSONALES */}
                             <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
                                <Phone className="h-5 w-5 text-primary" />
                                <div className="flex flex-col">
                                    <p className="text-sm font-medium text-muted-foreground">Te llamarán al:</p>
                                    <p className="text-lg font-bold">{userProfile.phoneNumber}</p>
                                </div>
                            </div>

                             <FormField control={form.control} name="name" render={({ field }) => (
                                <FormItem><FormLabel>Nombre de quien recibe</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                             )} />
                            
                            <Separator />

                            {/* SECCIÓN MAPA / GPS */}
                            <div className="space-y-3">
                                <FormLabel className="text-base font-semibold">1. Ubicación GPS (Obligatorio)</FormLabel>
                                
                                {addressIdValue === 'new' ? (
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                                        <p className="text-sm text-blue-800">
                                            Para asegurar que tu pedido llegue bien, por favor comparte tu ubicación actual.
                                        </p>
                                        <Button 
                                            type="button" 
                                            onClick={handleGetLocation} 
                                            disabled={locationStatus === 'loading' || locationStatus === 'success'}
                                            className={`w-full ${locationStatus === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                        >
                                            {locationStatus === 'loading' ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Obteniendo GPS...</>
                                            ) : locationStatus === 'success' ? (
                                                <><MapPin className="mr-2 h-4 w-4"/> ¡Ubicación Guardada!</>
                                            ) : (
                                                <><Crosshair className="mr-2 h-4 w-4"/> 📍 Usar mi ubicación actual</>
                                            )}
                                        </Button>
                                        {locationStatus === 'success' && (
                                            <p className="text-xs text-green-700 text-center font-medium">
                                                Coordenadas: {coords?.latitude.toFixed(4)}, {coords?.longitude.toFixed(4)}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <Alert className="bg-gray-50">
                                        <MapPin className="h-4 w-4" />
                                        <AlertTitle>Usando dirección guardada</AlertTitle>
                                        <AlertDescription className="text-xs text-muted-foreground">
                                            Usaremos las coordenadas de tu dirección guardada.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* SELECTOR DE DIRECCIONES GUARDADAS */}
                                {hasAddresses && (
                                    <FormField control={form.control} name="addressId" render={({ field }) => (
                                        <FormItem className="mt-2">
                                            <Select onValueChange={(val) => {
                                                field.onChange(val);
                                                if (val !== 'new') setLocationStatus('idle');
                                            }} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {userProfile.addresses?.map(addr => <SelectItem key={addr.id} value={addr.id}>{addr.street}</SelectItem>)}
                                                    <SelectItem value="new">+ Nueva ubicación</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )} />
                                )}
                            </div>

                            {/* SECCIÓN REFERENCIAS TEXTO */}
                            <FormField control={form.control} name="address" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-base font-semibold">2. Referencias / Detalle</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="Ej: Casa blanca rejas negras, frente a la plaza." 
                                            {...field}
                                            disabled={hasAddresses && form.getValues('addressId') !== 'new'}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    <p className="text-xs text-muted-foreground">Ayuda al repartidor a identificar tu casa.</p>
                                </FormItem>
                            )} />

                        </CardContent>
                    </Card>

                     <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold shadow-lg bg-green-600 hover:bg-green-700" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" /> Procesando...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Pagar ${finalTotal.toFixed(2)}
                            </span>
                        )}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground flex justify-center items-center gap-1">
                        <Lock className="h-3 w-3" /> Pagos procesados de forma segura con MercadoPago
                    </p>
                </form>
            </Form>
        </div>

        {/* RESUMEN */}
        <div className="md:col-span-1">
          <Card className="sticky top-24 shadow-md border-t-4 border-t-orange-500">
            <CardHeader className="bg-muted/20"><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-orange-600" /> Resumen del Pedido</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-6">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div className="flex gap-2">
                      <span className="font-bold text-muted-foreground">x{item.quantity}</span>
                      <span className="font-medium line-clamp-1">{item.name}</span> 
                  </div>
                  <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
               <div className="flex justify-between text-muted-foreground">
                <p>Subtotal Productos</p>
                <p>${totalPrice.toFixed(2)}</p>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <p>Costo de Envío</p>
                <p>${shippingCost.toFixed(2)}</p>
              </div>
              {serviceFeeAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <p>Tarifa de servicio ({globalConfig?.serviceFee}%)</p>
                    <p>${serviceFeeAmount.toFixed(2)}</p>
                  </div>
              )}
              <Separator />
              <div className="flex justify-between font-black text-2xl pt-2">
                <p>Total</p>
                <p className="text-green-600">${finalTotal.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}