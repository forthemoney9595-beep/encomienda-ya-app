'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useAuthInstance } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { createUserProfile } from '@/lib/user';
import { cn } from '@/lib/utils';
import { Bike, Car, Motorcycle } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  vehicleType: z.enum(["motocicleta", "automovil", "bicicleta"], {
    required_error: "Debes seleccionar un tipo de vehículo.",
  }),
});

export default function SignupDeliveryPage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuthInstance();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      
      await createUserProfile(userCredential.user.uid, {
        name: values.name,
        email: values.email,
        role: 'delivery',
        status: 'pending',
        vehicle: values.vehicleType,
      });

      toast({
        title: "¡Solicitud Enviada!",
        description: "Tu cuenta de repartidor ha sido creada y está pendiente de aprobación.",
      });
      router.push('/');
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error al Crear la Cuenta",
        description: error.code === 'auth/email-already-in-use' 
          ? "Este correo electrónico ya está en uso."
          : "Ocurrió un error. Por favor, inténtalo de nuevo.",
      });
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle className="text-2xl">Conviértete en Repartidor</CardTitle>
              <CardDescription>
                Regístrate para empezar a ganar dinero haciendo entregas.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Tu Nombre" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="nombre@ejemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Tipo de Vehículo</FormLabel>
                    <FormControl>
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                type="button"
                                variant={field.value === 'motocicleta' ? 'secondary' : 'outline'}
                                onClick={() => field.onChange('motocicleta')}
                                className="flex-col h-16"
                            >
                                <Motorcycle className="mb-1" />
                                Motocicleta
                            </Button>
                            <Button
                                type="button"
                                variant={field.value === 'automovil' ? 'secondary' : 'outline'}
                                onClick={() => field.onChange('automovil')}
                                className="flex-col h-16"
                            >
                                <Car className="mb-1" />
                                Automóvil
                            </Button>
                            <Button
                                type="button"
                                variant={field.value === 'bicicleta' ? 'secondary' : 'outline'}
                                onClick={() => field.onChange('bicicleta')}
                                className="flex-col h-16"
                            >
                                <Bike className="mb-1" />
                                Bicicleta
                            </Button>
                        </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col">
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Enviando solicitud..." : "Crear Cuenta de Repartidor"}
              </Button>
              <div className="mt-4 text-center text-sm">
                ¿Ya tienes una cuenta?{" "}
                <Link href="/login" className="underline">
                  Iniciar Sesión
                </Link>
              </div>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
