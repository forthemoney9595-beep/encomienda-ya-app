'use client';

import { useState } from 'react';
import { useHydrated } from '@/hooks/use-hydrated';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { AuthScreen, AuthDivider, GoogleButton, authButton } from '@/components/auth-screen';
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, AuthErrorCodes, GoogleAuthProvider, signInWithPopup, browserPopupRedirectResolver } from 'firebase/auth';
import { doc, writeBatch } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { isTaken, uniqueRef, uniquePayload } from '@/lib/unique-ids';
import { setSignupInProgress } from '@/lib/signup-flag';
import type { Address } from '@/lib/placeholder-data';

const formSchema = z.object({
  name: z.string().min(5, "Ingresá tu nombre y apellido completos."),
  email: z.string().email("Ingresá un correo electrónico válido."),
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
  const hydrated = useHydrated();

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
      await signInWithPopup(auth, provider, browserPopupRedirectResolver); // PERF-012: Auth se inicializa sin el resolver; se pasa solo acá
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
            displayName: values.name, // FE-C-002: el saludo del home lee displayName
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

  // Entradas de NEGOCIO (Opción A, ago 2026): visibles pero secundarias — el 95% de quien
  // llega acá es cliente; comercios y repartidores tienen su puerta sin ensuciar el camino.
  const footer = (
    <>
      <p>
        ¿Ya tenés una cuenta?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">Iniciá sesión</Link>
      </p>
      <div className="glass mx-auto grid gap-1 rounded-2xl p-2 text-sm">
        <Link href="/signup/store" className="flex min-h-11 items-center justify-center rounded-xl px-3 transition-colors hover:bg-primary/10">
          ¿Tenés un comercio?&nbsp;<span className="font-semibold text-primary">Registrá tu tienda</span>
        </Link>
        <Link href="/signup/delivery" className="flex min-h-11 items-center justify-center rounded-xl px-3 transition-colors hover:bg-primary/10">
          ¿Querés repartir?&nbsp;<span className="font-semibold text-primary">Sumate como repartidor</span>
        </Link>
      </div>
      <p className="text-sm">
        Al registrarte aceptás nuestros{' '}
        <Link href="/terms" className="font-semibold underline underline-offset-4">Términos</Link> y la{' '}
        <Link href="/privacy" className="font-semibold underline underline-offset-4">Política de Privacidad</Link>.
      </p>
    </>
  );

  return (
    <AuthScreen
      testId="signup-buyer-card"
      title="Creá tu cuenta"
      description="Es gratis. Con tu cuenta pedís a las tiendas del pueblo y seguís tu pedido hasta la puerta."
      footer={footer}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} method="post" action="#" className="grid gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre y apellido</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Ej. Juana Pérez" {...field} />
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
                <FormLabel>Correo electrónico</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" inputMode="email" placeholder="nombre@ejemplo.com" {...field} />
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
                  <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="Ej. 3834123456" {...field} />
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
                  <Input type="password" autoComplete="new-password" placeholder="Al menos 6 caracteres" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className={authButton + ' mt-1'} disabled={!hydrated || isSubmitting}>
            {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin"/>Creando cuenta...</> : "Crear cuenta"}
          </Button>
        </form>
      </Form>

      {/* Registro con Google — mismo botón que el login */}
      <AuthDivider />
      <GoogleButton onClick={handleGoogleSignup} disabled={isSubmitting} />
    </AuthScreen>
  );
}
