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
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, AuthErrorCodes } from 'firebase/auth';
import { doc, writeBatch } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { isTaken, uniqueRef, uniquePayload } from '@/lib/unique-ids';
import { setSignupInProgress } from '@/lib/signup-flag';
import type { Address } from '@/lib/placeholder-data';

const formSchema = z.object({
  name: z.string().min(5, "Ingresá tu nombre y apellido completos."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  // El repartidor necesita poder contactarte para coordinar la entrega -- antes el
  // teléfono ni se pedía en el alta (se agregaba, si acaso, mucho después en /profile).
  phoneNumber: z.string().min(8, "Ingresá un teléfono válido (con código de área).").regex(/^[0-9+\s-]+$/, "Solo números, espacios, + y -."),
});

export default function SignupBuyerPage() {
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
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!auth || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Los servicios de Firebase no están disponibles." });
        return;
    }
    setIsSubmitting(true);
    // Anti-carrera: el fallback de auth-context no debe crear el perfil mientras este
    // batch lo está creando (ver src/lib/signup-flag.ts — bug real de la gran prueba).
    setSignupInProgress(true);

    let createdUser = null as import('firebase/auth').User | null;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const user = userCredential.user;
        createdUser = user;

        // Teléfono ÚNICO (Fase PP, anti multi-cuenta): un número = una cuenta. El
        // pre-chequeo da el error claro; la garantía real es el create del batch.
        if (await isTaken(firestore, 'tel', values.phoneNumber)) {
            await user.delete().catch(() => {});
            toast({
                variant: "destructive",
                title: "Ese teléfono ya tiene una cuenta",
                description: "Si es tuyo y perdiste el acceso, usá \"Olvidé mi contraseña\" o escribinos desde soporte.",
            });
            setIsSubmitting(false);
            return;
        }

        const batch = writeBatch(firestore);
        batch.set(doc(firestore, 'users', user.uid), {
            uid: user.uid,
            name: values.name,
            email: values.email,
            phoneNumber: values.phoneNumber,
            role: 'buyer' as const,
            addresses: [] as Address[],
        });
        batch.set(uniqueRef(firestore, 'tel', values.phoneNumber), uniquePayload('tel', values.phoneNumber, user.uid));
        await batch.commit();

        await sendEmailVerification(user);

        toast({
            title: "¡Cuenta Creada!",
            description: "Te enviamos un correo de verificación. Revisá tu bandeja de entrada.",
        });
        router.push('/');

    } catch (error: any) {
        if (error.code === AuthErrorCodes.EMAIL_EXISTS) {
            // If email exists, try to sign in instead
            try {
                await signInWithEmailAndPassword(auth, values.email, values.password);
                 toast({
                    title: "¡Sesión Iniciada!",
                    description: "Ya tenías una cuenta, así que hemos iniciado sesión por ti.",
                });
                router.push('/');
            } catch (signInError: any) {
                 toast({
                    variant: "destructive",
                    title: "Error al Iniciar Sesión",
                    description: "El correo ya existe pero la contraseña es incorrecta.",
                });
            }
        } else {
             console.error("Error creating buyer account:", error);
            // Rollback: no dejar una cuenta de Auth sin perfil (podía loguear a medias).
            if (createdUser) await createdUser.delete().catch(() => {});
            toast({
                variant: "destructive",
                title: "Error al Registrarse",
                description: error.code === 'permission-denied'
                    ? "Ese teléfono ya tiene una cuenta registrada."
                    : "No se pudo crear la cuenta. Por favor, inténtalo de nuevo.",
            });
        }
    } finally {
        setSignupInProgress(false);
        setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle className="text-2xl">Crear Cuenta de Comprador</CardTitle>
              <CardDescription>
                Regístrate para empezar a hacer pedidos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre y apellido</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Juana Pérez" {...field} />
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
            </CardContent>
            <CardFooter className="flex flex-col">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Creando cuenta...</> : "Crear Cuenta"}
              </Button>
              <div className="mt-4 text-center text-sm">
                ¿Ya tienes una cuenta?{" "}
                <Link href="/login" className="underline">Iniciar Sesión</Link>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Al registrarte aceptás nuestros{' '}
                <Link href="/terms" className="underline">Términos</Link> y{' '}
                <Link href="/privacy" className="underline">Política de Privacidad</Link>.
              </p>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
