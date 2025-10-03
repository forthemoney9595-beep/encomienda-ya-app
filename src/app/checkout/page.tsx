
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
import { useAuth, useFirestore } from '@/firebase';
import { useEffect, useState } from 'react';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const formSchema = z.object({
  name: z.string().min(3, "El nombre es obligatorio."),
  address: z.string().min(5, "La dirección es obligatoria."),
});


export default function CheckoutPage() {
  const { cart, totalPrice, totalItems, clearCart, storeId } = useCart();
  const { user, loading: authLoading } = useAuth();
  const db = useFirestore();
  const { addPrototypeOrder, prototypeStores } = usePrototypeData();
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
    },
  });

  useEffect(() => {
    if (clientLoaded && user && !authLoading) {
        form.reset({
            ...form.getValues(),
            name: user.name || "",
        });
    }
  }, [user, authLoading, form, clientLoaded]);

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
    if (!user || !storeId || cart.length === 0) {
      toast({
        variant: "destructive",
        title: "Error de Validación",
        description: "Falta información del usuario, la tienda o el carrito está vacío.",
      });
      return;
    };

    setIsSubmitting(true);

    try {
      const isPrototype = storeId.startsWith('proto-');
      
      let storeName = "Nombre de Tienda Real"; // Placeholder for real store
      let storeAddress = "Dirección de Tienda Real"; // Placeholder for real store

      if (isPrototype) {
        const protoStore = prototypeStores.find(s => s.id === storeId);
        if (protoStore) {
            storeName = protoStore.name;
            storeAddress = protoStore.address;
        }
      } else {
        // In a real app, you might fetch store details if not already available
      }

      const createdOrder = await createOrder(db, {
        userId: user.uid,
        customerName: user.name,
        items: cart,
        shippingInfo: {
          name: values.name,
          address: values.address
        },
        storeId: storeId,
        storeName: storeName,
        storeAddress: storeAddress,
      });

      if (createdOrder.id.startsWith('proto-')) {
        addPrototypeOrder(createdOrder);
      }

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

  if (!clientLoaded || authLoading || !user || totalItems === 0) {
     return <div className="container mx-auto text-center py-20"><Loader2 className="mx-auto h-12 w-12 animate-spin" /></div>
  }

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
                            <FormField
                                control={form.control}
                                name="address"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Dirección de Entrega</FormLabel>
                                    <FormControl>
                                    <Input placeholder="Calle, número, ciudad" {...field} />
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
