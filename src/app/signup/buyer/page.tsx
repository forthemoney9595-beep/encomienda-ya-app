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
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, AuthErrorCodes, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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

  // Registro con Google (pedido de David, 18/8): mismo flujo que el botón del login —
  // para una cuenta NUEVA, auth-context crea el perfil de cliente solo (Fase X,
  // verificado e2e en la Tanda B). El teléfono, que Google no da, se completa en la
  // primera compra (el checkout lo exige y lo guarda al perfil).
  const handleGoogleSignup = async () => {
    if (!auth) return;
    setIsSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast({ title: '¡Bienvenido!', description: 'Tu cuenta quedó lista con Google.' });
      router.push('/');
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        console.error('Error registro Google:', error);
        toast({ variant: 'destructive', title: 'No se pudo continuar con Google', description: 'Probá de nuevo o registrate con tu correo.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <CardTitle className="text-2xl">Creá tu cuenta</CardTitle>
              <CardDescription>
                Registrate gratis para empezar a hacer pedidos.
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

              {/* Registro con Google — mismo estilo que el botón del login */}
              <div className="relative w-full my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">o continuá con</span>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full relative" onClick={handleGoogleSignup} disabled={isSubmitting}>
                <svg className="mr-2 h-4 w-4 absolute left-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>

              <div className="mt-4 text-center text-sm">
                ¿Ya tienes una cuenta?{" "}
                <Link href="/login" className="underline">Iniciar Sesión</Link>
              </div>

              {/* Entradas de NEGOCIO (Opción A, ago 2026): visibles pero secundarias —
                  el 95% de quien llega acá es cliente; comercios y repartidores tienen
                  su puerta sin ensuciar el camino principal. */}
              <div className="mt-4 w-full rounded-lg border bg-muted/30 p-3 text-center text-xs space-y-1">
                <p>🏪 ¿Tenés un comercio? <Link href="/signup/store" className="text-primary underline">Registrá tu tienda</Link></p>
                <p>🛵 ¿Querés repartir? <Link href="/signup/delivery" className="text-primary underline">Sumate como repartidor</Link></p>
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
