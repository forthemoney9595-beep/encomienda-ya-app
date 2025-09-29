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
import { CreditCard, Home, User, Loader2 } from 'lucide-react';
import { createOrder } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';

const formSchema = z.object({
  name: z.string().min(3, "El nombre es obligatorio."),
  address: z.string().min(5, "La dirección es obligatoria."),
  cardNumber: z.string().length(16, "El número de tarjeta debe tener 16 dígitos.").filter(val => /^\d+$/.test(val), "Solo se admiten números."),
  expiryDate: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "El formato debe ser MM/AA."),
  cvc: z.string().length(3, "El CVC debe tener 3 dígitos.").filter(val => /^\d+$/.test(val), "Solo se admiten números."),
});


export default function CheckoutPage() {
  const { cart, totalPrice, totalItems, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

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

  if (authLoading) {
     return <div className="container mx-auto text-center py-20"><Loader2 className="mx-auto h-12 w-12 animate-spin" /></div>
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  if (totalItems === 0) {
    return (
      <div className="container mx-auto text-center py-20">
        <h2 className="text-2xl font-bold">Tu carrito está vacío</h2>
        <p className="text-muted-foreground mt-2">Añade productos a tu carrito antes de proceder al pago.</p>
        <Button onClick={() => router.push('/')} className="mt-4">Volver a la tienda</Button>
      </div>
    )
  }
  
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) return;

    try {
      const orderId = await createOrder(user.uid, cart, totalPrice, {
        name: values.name,
        address: values.address
      });

      toast({
        title: "¡Pedido Realizado!",
        description: "Gracias por tu compra. Tu pedido está siendo procesado.",
      });
      clearCart();
      router.push(`/orders/${orderId}`);
    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        variant: "destructive",
        title: "Error al realizar el pedido",
        description: "Hubo un problema al guardar tu pedido. Por favor, inténtalo de nuevo.",
      });
    }
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
                                    <Input placeholder="---- ---- ---- ----" {...field} />
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
                                        <Input placeholder="MM/AA" {...field} />
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
                                        <Input placeholder="---" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>
                     <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando Pedido...</> : `Pagar $${totalPrice.toFixed(2)}`}
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
              <div className="flex justify-between font-bold text-lg">
                <p>Total</p>
                <p>${totalPrice.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
