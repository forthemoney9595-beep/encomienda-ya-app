
'use client';

import { useCart } from '@/context/cart-context';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Home, Loader2, Info } from 'lucide-react';
import { createOrder } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDoc } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { Store } from '@/lib/placeholder-data';


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

  useEffect(() => {
    setClientLoaded(true);
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      addressId: "",
    },
  });
  
  const addressIdValue = form.watch('addressId');

  useEffect(() => {
    if (clientLoaded && userProfile && !authLoading) {
        form.reset({
            name: userProfile.name || "",
            address: userProfile.addresses && userProfile.addresses.length > 0 
                ? `${userProfile.addresses[0].street}, ${userProfile.addresses[0].city}, ${userProfile.addresses[0].postalCode}`
                : "",
            addressId: userProfile.addresses && userProfile.addresses.length > 0 ? userProfile.addresses[0].id : "new",
        });
    }
  }, [userProfile, authLoading, form, clientLoaded]);
  
  useEffect(() => {
    if(addressIdValue && userProfile?.addresses) {
        if(addressIdValue === 'new') {
            form.setValue('address', '');
        } else {
            const selectedAddress = userProfile.addresses.find(a => a.id === addressIdValue);
            if(selectedAddress) {
                 form.setValue('address', `${selectedAddress.street}, ${selectedAddress.city}, ${selectedAddress.postalCode}`);
            }
        }
    }
  }, [addressIdValue, userProfile?.addresses, form]);


  useEffect(() => {
    if (clientLoaded && !authLoading && !user) {
      router.push('/login');
    }
  }, [clientLoaded, authLoading, user, router]);

  useEffect(() => {
    if (clientLoaded && !authLoading && (totalItems === 0 || !storeId)) {
      toast({
        title: 'Tu carrito está vacío',
        description: 'Serás redirigido a la página principal.',
      })
      router.push('/');
    }
  }, [clientLoaded, authLoading, totalItems, storeId, router, toast]);
  
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user || !userProfile || !storeId || !firestore || cart.length === 0) {
      toast({
        variant: "destructive",
        title: "Error de Validación",
        description: "Falta información del usuario, la tienda o el carrito está vacío.",
      });
      return;
    };

    setIsSubmitting(true);

    try {
      const storeRef = doc(firestore, 'stores', storeId);
      const storeSnap = await getDoc(storeRef);

      if (!storeSnap.exists()) {
        throw new Error("La tienda para este pedido no existe.");
      }

      const storeData = storeSnap.data() as Store;

      const createdOrder = await createOrder({
        userId: user.uid,
        customerName: userProfile.name,
        items: cart,
        shippingInfo: {
          name: values.name,
          address: values.address
        },
        storeId: storeId,
        storeName: storeData.name,
        storeAddress: storeData.address,
      });

      // No need to manually add to context anymore, this will be handled by Firestore listeners
      // addPrototypeOrder(createdOrder);

      toast({
        title: "¡Pedido Solicitado!",
        description: "Tu solicitud ha sido enviada a la tienda. Serás notificado cuando confirmen.",
      });
      clearCart();
      router.push(`/orders/${createdOrder.id}`);

    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        variant: "destructive",
        title: "Error al Realizar el Pedido",
        description: "Hubo un problema al guardar tu pedido. Por favor, inténtalo de nuevo.",
      });
    } finally {
        setIsSubmitting(false);
    }
  }

  if (!clientLoaded || authLoading || !userProfile || totalItems === 0) {
     return <div className="container mx-auto text-center py-20"><Loader2 className="mx-auto h-12 w-12 animate-spin" /></div>
  }
  
  const hasAddresses = userProfile.addresses && userProfile.addresses.length > 0;

  return (
    <div className="container mx-auto">
      <PageHeader title="Solicitar Pedido" description="Confirma tu dirección y envía la solicitud a la tienda." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Home /> Información de Envío</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre Completo</FormLabel>
                                    <FormControl>
                                    <Input placeholder="Tu Nombre Completo" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            {hasAddresses && (
                                <FormField
                                control={form.control}
                                name="addressId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Dirección</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona una dirección guardada" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {userProfile.addresses?.map(addr => (
                                                    <SelectItem key={addr.id} value={addr.id}>
                                                        {addr.label}: {addr.street}, {addr.city}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value="new">Usar una dirección nueva</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                                />
                            )}
                            <FormField
                                control={form.control}
                                name="address"
                                render={({ field }) => (
                                <FormItem>
                                    {!hasAddresses && <FormLabel>Dirección de Entrega</FormLabel>}
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
                                )}
                            />
                        </CardContent>
                    </Card>
                     <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Solicitando Pedido...</> : `Solicitar Pedido por $${(totalPrice + 5.00).toFixed(2)}`}
                    </Button>
                </form>
            </Form>
        </div>
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Resumen del Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">Cantidad: {item.quantity}</p>
                  </div>
                  <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
              <Separator />
               <div className="flex justify-between text-muted-foreground">
                <p>Subtotal</p>
                <p>${totalPrice.toFixed(2)}</p>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <p>Tarifa de envío (aprox.)</p>
                <p>$5.00</p>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <p>Total (aprox.)</p>
                <p>${(totalPrice + 5.00).toFixed(2)}</p>
              </div>
            </CardContent>
             <CardFooter>
                 <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Paso Siguiente</AlertTitle>
                    <AlertDescription>
                        Una vez que envíes tu solicitud, la tienda confirmará la disponibilidad de los productos.
                    </AlertDescription>
                </Alert>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
