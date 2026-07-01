
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Bike, Car, Loader2 } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

// Repartidor: el alta que más datos reales necesita (es quien maneja plata en efectivo
// y entra a la casa de un cliente) -- antes solo pedía nombre/email/contraseña/vehículo,
// sin nada objetivo para identificar a la persona (el DNI/fecha de nacimiento recién se
// verían, indirectamente, en la foto del carnet que se sube después en /profile).
const formSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  phoneNumber: z.string().min(8, "Ingresá un teléfono válido (con código de área).").regex(/^[0-9+\s-]+$/, "Solo números, espacios, + y -."),
  dni: z.string().regex(/^\d{7,8}$/, "El DNI debe tener 7 u 8 números, sin puntos."),
  birthDate: z.string().refine((val) => {
    if (!val) return false;
    const birth = new Date(val);
    const age = (Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return age >= 18;
  }, "Tenés que ser mayor de 18 años para ser repartidor."),
  vehicleType: z.enum(["motocicleta", "automovil", "bicicleta"], {
    required_error: "Debes seleccionar un tipo de vehículo.",
  }),
});

export default function SignupDeliveryPage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phoneNumber: "",
      dni: "",
      birthDate: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!auth || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Los servicios de Firebase no están disponibles." });
        return;
    }
    setIsSubmitting(true);

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const user = userCredential.user;

        // Create user profile in Firestore
        const userProfile = {
            uid: user.uid,
            name: values.name,
            email: values.email,
            phoneNumber: values.phoneNumber,
            dni: values.dni,
            birthDate: values.birthDate,
            role: 'delivery' as const,
            vehicle: values.vehicleType,
            status: 'Pendiente', // Delivery personnel needs approval
            isApproved: false,
        };
        
        await setDoc(doc(firestore, "users", user.uid), userProfile);
        await sendEmailVerification(user);

        toast({
            title: "¡Solicitud Enviada!",
            description: "Revisá tu correo para verificar tu cuenta. Tu perfil de repartidor está pendiente de aprobación.",
        });
        router.push('/');
        
    } catch (error: any) {
        console.error("Error creating delivery account:", error);
        toast({
            variant: "destructive",
            title: "Error al Registrarse",
            description: error.code === 'auth/email-already-in-use' 
                ? "Este correo electrónico ya está en uso."
                : "No se pudo crear la cuenta. Por favor, inténtalo de nuevo.",
        });
    } finally {
        setIsSubmitting(false);
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
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono / WhatsApp</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="Ej. 3834123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dni"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DNI</FormLabel>
                      <FormControl>
                        <Input placeholder="Sin puntos" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de nacimiento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                                <Bike className="mb-1" />
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
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando solicitud...</> : "Crear Cuenta de Repartidor"}
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
