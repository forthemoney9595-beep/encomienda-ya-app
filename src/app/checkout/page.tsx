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
import { Home, Loader2, Phone, AlertTriangle, ArrowLeft, Store as StoreIcon, Receipt, CreditCard, Lock } from 'lucide-react';
// createOrder se importa pero ya no se usa directamente para escribir en BD
import { createOrder } from '@/lib/order-service'; 
import { useAuth } from '@/context/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase'; 

interface StoreData {
  name: string;
  address: string;
  maintenanceMode?: boolean;
  userId: string; // ✅ El ID del dueño de la tienda
}

const formSchema = z.object({
  name: z.string().min(3, "El nombre es obligatorio."),
  address: z.string().min(5, "La dirección es obligatoria."),
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
    const shipping = 5.00; 
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
            address: userProfile.addresses?.[0] ? `${userProfile.addresses[0].street}, ${userProfile.addresses[0].city}` : "",
            addressId: userProfile.addresses?.[0]?.id || "new",
        });
    }
  }, [userProfile, authLoading, form, clientLoaded, router, toast]);
  
  // Lógica de dropdown de direcciones
  useEffect(() => {
    if(addressIdValue && userProfile?.addresses && addressIdValue !== 'new') {
        const selected = userProfile.addresses.find((a: any) => a.id === addressIdValue);
        if(selected) form.setValue('address', `${selected.street}, ${selected.city}, ${selected.zipCode}`);
    } else if (addressIdValue === 'new') {
        form.setValue('address', '');
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
  
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (globalConfig?.maintenanceMode || storeData?.maintenanceMode) {
        toast({ variant: "destructive", title: "Lo sentimos", description: "No se pueden realizar pedidos en este momento." });
        return;
    }

    if (!user || !userProfile || !storeId || !firestore) return;

    if (!userProfile.phoneNumber || userProfile.phoneNumber.trim() === '') {
        toast({
            variant: 'destructive',
            title: 'Faltan datos',
            description: 'Por favor, guarda tu número de teléfono antes de continuar.',
        });
        router.push('/profile');
        return;
    }

    setIsSubmitting(true);
    try {
      // 1. Datos de Tienda y Seguridad
      const storeRef = doc(firestore, 'stores', storeId);
      const storeSnap = await getDoc(storeRef);

      if (!storeSnap.exists()) {
        throw new Error("La tienda para este pedido no existe.");
      }
      const currentStoreData = storeSnap.data() as StoreData;

      if (!currentStoreData.userId) {
         console.warn("⚠️ La tienda no tiene userId asignado. La notificación podría fallar.");
      }

      // ⚠️ 2. SANITIZACIÓN DE ITEMS (IMPORTANTE)
      // Limpiamos los datos del carrito para asegurar que el API reciba 'price' numérico
      console.log("🛒 [Checkout] Contenido Crudo del Carrito:", cart);

      const cleanItems = cart.map((item: any) => {
          // Buscamos el precio en cualquier variable posible
          const rawPrice = item.price || item.unit_price || item.unitPrice || item.product?.price || 0;
          const parsedPrice = Number(rawPrice);

          return {
            id: item.id,
            title: item.name || item.title || item.productName || 'Producto',
            // Si el precio no es un número válido, forzamos 0
            price: isNaN(parsedPrice) ? 0 : parsedPrice,
            quantity: Number(item.quantity || 1)
          };
      });

      console.log("📤 [Checkout] Items limpios enviados a API:", cleanItems);

      // Verificación de seguridad local
      if (cleanItems.some((i: any) => i.price <= 0)) {
          console.error("❌ ERROR: Se detectaron productos con precio 0 o inválido.");
          toast({ variant: "destructive", title: "Error en el Carrito", description: "Hay productos con precio inválido. Por favor, vacía el carrito e intenta de nuevo." });
          setIsSubmitting(false);
          return;
      }

      // 3. CREAR ORDEN VÍA API SEGURA (BACKEND)
      const createResponse = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              userId: user.uid,
              items: cleanItems, // Enviamos los items limpios
              storeId: storeId,
              shippingInfo: { name: values.name, address: values.address },
              paymentMethod: 'mercadopago' 
          })
      });

      const orderDataResult = await createResponse.json();

      if (!createResponse.ok) {
          throw new Error(orderDataResult.error || "Error creando orden segura");
      }

      const newOrderId = orderDataResult.orderId;
      console.log("📦 Orden Segura Creada (Server-Side):", newOrderId);

      // 4. GENERAR LINK DE PAGO
      const paymentResponse = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: cleanItems, // Usamos items limpios también aquí
            orderId: newOrderId,
            userId: user.uid, 
            storeId: storeId,
            storeOwnerId: currentStoreData.userId, 
            payerEmail: user.email || 'guest@encomiendaya.com',
        })
      });

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(paymentData.error || "Error al generar pago");
      }

      // 5. LIMPIEZA Y REDIRECCIÓN
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
                    <div className={`mx-auto bg-${isStore ? 'orange' : 'red'}-100 p-4 rounded-full mb-4 w-fit`}>
                        {isStore ? <StoreIcon className="h-10 w-10 text-orange-600" /> : <AlertTriangle className="h-10 w-10 text-red-600" />}
                    </div>
                    <CardTitle className={`text-2xl text-${isStore ? 'orange' : 'red'}-800`}>
                        {isStore ? `${storeData?.name} Cerrada` : 'Plataforma en Mantenimiento'}
                    </CardTitle>
                    <CardDescription className={`text-${isStore ? 'orange' : 'red'}-700`}>
                        {isStore ? 'Esta tienda está temporalmente fuera de servicio.' : 'Estamos realizando mejoras técnicas.'}
                    </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pt-4">
                    <Button variant="outline" onClick={() => router.push('/')} className={`w-full border-${isStore ? 'orange' : 'red'}-200 bg-white`}>
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
      <PageHeader title="Finalizar Compra" description="Confirma tus datos y procede al pago seguro." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* FORMULARIO */}
        <div className="md:col-span-2">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Home className="h-5 w-5" /> Dirección de Entrega</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
                                <Phone className="h-5 w-5 text-primary" />
                                <div className="flex flex-col">
                                    <p className="text-sm font-medium text-muted-foreground">Contacto Validado</p>
                                    <p className="text-lg font-bold">{userProfile.phoneNumber}</p>
                                </div>
                            </div>

                             <FormField control={form.control} name="name" render={({ field }) => (
                                <FormItem><FormLabel>Nombre de quien recibe</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                             )} />
                            
                            {hasAddresses && (
                                <FormField control={form.control} name="addressId" render={({ field }) => (
                                    <FormItem><FormLabel>Mis Direcciones</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {userProfile.addresses?.map(addr => <SelectItem key={addr.id} value={addr.id}>{addr.street}</SelectItem>)}
                                                <SelectItem value="new">Nueva dirección</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )} />
                            )}
                            
                            <FormField control={form.control} name="address" render={({ field }) => (
                                <FormItem>
                                    {!hasAddresses && <FormLabel>Dirección</FormLabel>}
                                    <FormControl>
                                        <Input 
                                            placeholder="Calle, número, ciudad" 
                                            {...field}
                                            disabled={hasAddresses && form.getValues('addressId') !== 'new'}
                                            className={(!hasAddresses || form.getValues('addressId') === 'new') ? '' : 'bg-muted/50'}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </CardContent>
                    </Card>

                     <Button type="submit" size="lg" className="w-full h-12 text-lg font-semibold shadow-md" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" /> Procesando...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Pagar ${finalTotal.toFixed(2)} con MercadoPago
                            </span>
                        )}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground flex justify-center items-center gap-1">
                        <Lock className="h-3 w-3" /> Pagos procesados de forma segura
                    </p>
                </form>
            </Form>
        </div>

        {/* RESUMEN */}
        <div className="md:col-span-1">
          <Card className="sticky top-20">
            <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Tu Pedido</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div><span className="font-medium">{item.name}</span> <span className="text-muted-foreground">x{item.quantity}</span></div>
                  <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
               <div className="flex justify-between text-muted-foreground">
                <p>Subtotal</p>
                <p>${totalPrice.toFixed(2)}</p>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <p>Envío</p>
                <p>${shippingCost.toFixed(2)}</p>
              </div>
              {serviceFeeAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <p>Tarifa de servicio ({globalConfig?.serviceFee}%)</p>
                    <p>${serviceFeeAmount.toFixed(2)}</p>
                  </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-xl">
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