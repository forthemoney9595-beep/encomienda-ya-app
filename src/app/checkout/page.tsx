
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
import { CreditCard, Home, Loader2 } from 'lucide-react';
import { createOrder } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
import { useEffect, useState } from 'react';
import { usePrototypeData } from '@/context/prototype-data-context';
import { prototypeStore } from '@/lib/placeholder-data';

const formSchema = z.object({
  name: z.string().min(3, "El nombre es obligatorio."),
  address: z.string().min(5, "La dirección es obligatoria."),
  cardNumber: z.string().min(1, "El número de tarjeta es obligatorio."),
  expiryDate: z.string().min(1, "La fecha de expiración es obligatoria."),
  cvc: z.string().min(1, "El CVC es obligatorio."),
});


export default function CheckoutPage() {
  const { cart, totalPrice, totalItems, clearCart, storeId } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { createPrototypeOrder } = usePrototypeData();
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
      cardNumber: "",
      expiryDate: "",
      cvc: "",
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    // This check needs to run only on the client after hydration
    if (clientLoaded && !authLoading && user && (totalItems === 0 || !storeId)) {
      toast({
        title: 'Tu carrito está vacío o la tienda no está definida',
        description: 'Redirigiendo a la página principal...',
      })
      router.push('/');
    }
  }, [totalItems, storeId, authLoading, router, toast, user, clientLoaded]);
  
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    if (!user || !storeId || cart.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Falta información del usuario, la tienda o el carrito está vacío.",
      });
      setIsSubmitting(false);
      return;
    };

    try {
      let orderId;
      if (user.uid.startsWith('proto-')) {
          const deliveryFee = 5.00;
          const total = totalPrice + deliveryFee;
          const newOrderData = {
              userId: user.uid,
              customerName: user.name,
              items: cart,
              total: total,
              deliveryFee: deliveryFee,
              status: 'En preparación' as const,
              storeId: storeId,
              storeName: prototypeStore.name,
              storeAddress: prototypeStore.address,
              shippingAddress: {
                  name: values.name,
                  address: values.address
              },
          };
          // Use the centralized context function to create the order
          const createdOrder = createPrototypeOrder(newOrderData);
          orderId = createdOrder.id;

      } else {
          const orderData = await createOrder({
            userId: user.uid,
            items: cart,
            shippingInfo: {
              name: values.name,
              address: values.address
            },
            storeId: storeId,
          });
          orderId = orderData.orderId;
      }

      toast({
        title: "¡Pedido Realizado!",
        description: "Gracias por tu compra. Tu pedido está siendo procesado.",
      });
      clearCart();
      // Wait a moment for context to update before redirecting
      setTimeout(() => router.push(`/orders/${orderId}`), 100);

    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        variant: "destructive",
        title: "Error al realizar el pedido",
        description: "Hubo un problema al guardar tu pedido. Por favor, inténtalo de nuevo.",
      });
    } finally {
        setIsSubmitting(false);
    }
  }

   if (authLoading || !user || !clientLoaded || (clientLoaded && totalItems === 0)) {
     return <div className="container mx-auto text-center py-20"><Loader2 className="mx-auto h-12 w-12 animate-spin" /></div>
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="Finalizar Compra" description="Confirma tu pedido y realiza el pago." />
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
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><CreditCard /> Detalles del Pago (Simulado)</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <FormField
                                control={form.control}
                                name="cardNumber"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Número de Tarjeta</FormLabel>
                                    <FormControl>
                                    <Input placeholder="Cualquier número es válido" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <div className="flex gap-4">
                                <FormField
                                    control={form.control}
                                    name="expiryDate"
                                    render={({ field }) => (
                                    <FormItem className="w-1/2">
                                        <FormLabel>Fecha de Expiración</FormLabel>
                                        <FormControl>
                                        <Input placeholder="Cualquier fecha" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="cvc"
                                    render={({ field }) => (
                                    <FormItem className="w-1/2">
                                        <FormLabel>CVC</FormLabel>
                                        <FormControl>
                                        <Input placeholder="Cualquier código" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>
                     <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando Pedido...</> : `Pagar $${(totalPrice + 5.00).toFixed(2)}`}
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
                <p className="text-xs text-muted-foreground">El costo de envío final se calculará al confirmar la dirección.</p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
