'use client';

import { useState } from 'react';
import { useHydrated } from '@/hooks/use-hydrated';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { AuthScreen, AuthGroupTitle, authButton } from '@/components/auth-screen';
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/lib/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { buildNewStoreData } from '@/lib/user-service';
import { isTaken, uniqueRef, uniquePayload } from '@/lib/unique-ids';
import { setSignupInProgress } from '@/lib/signup-flag';
import { STORE_CATEGORIES } from '@/lib/store-categories';
import { Loader2 } from 'lucide-react';


const formSchema = z.object({
  storeName: z.string().min(3, "El nombre de la tienda debe tener al menos 3 caracteres."),
  category: z.string({ required_error: "Elegí el rubro de tu negocio." }),
  address: z.string().min(5, "La dirección debe tener al menos 5 caracteres."),
  ownerName: z.string().min(5, "Ingresá tu nombre y apellido completos."),
  phoneNumber: z.string().min(8, "Ingresá un teléfono válido (con código de área).").regex(/^[0-9+\s-]+$/, "Solo números, espacios, + y -."),
  // DNI del dueño (Fase PP): la tienda es un negocio, pero el responsable es una persona.
  dni: z.string().regex(/^\d{7,8}$/, "El DNI debe tener 7 u 8 números, sin puntos."),
  // CUIT: 11 dígitos, con o sin guiones (XX-XXXXXXXX-X) -- se guarda solo el número.
  cuit: z.string().regex(/^\d{2}-?\d{8}-?\d{1}$/, "Formato de CUIT inválido (ej: 20-12345678-9)."),
  email: z.string().email("Ingresá un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export default function SignupStorePage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrated = useHydrated();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      storeName: "",
      address: "",
      ownerName: "",
      phoneNumber: "",
      dni: "",
      cuit: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!auth || !firestore) {
      toast({ variant: "destructive", title: "Error", description: "Los servicios de Firebase no están disponibles." });
      return;
    }
    setIsSubmitting(true);
    // Anti-carrera con el fallback de auth-context (ver src/lib/signup-flag.ts).
    setSignupInProgress(true);

    // CUIT normalizado (solo dígitos) para el registro anti multi-cuenta.
    const cuitDigits = values.cuit.replace(/\D/g, '');

    let createdUser = null as import('firebase/auth').User | null;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const user = userCredential.user;
        createdUser = user;

        // Anti multi-cuenta (Fase PP): CUIT, DNI del dueño y teléfono ÚNICOS. Pre-chequeo
        // para dar un error claro; la garantía REAL es el create del batch de abajo (dos
        // registros simultáneos: el segundo choca contra el doc reservado y todo falla).
        const dupChecks: { type: 'cuit' | 'dni' | 'tel'; raw: string; label: string }[] = [
            { type: 'cuit', raw: cuitDigits, label: 'Ese CUIT ya tiene una tienda registrada' },
            { type: 'dni', raw: values.dni, label: 'Ese DNI ya tiene una cuenta' },
            { type: 'tel', raw: values.phoneNumber, label: 'Ese teléfono ya tiene una cuenta' },
        ];
        for (const c of dupChecks) {
            if (await isTaken(firestore, c.type, c.raw)) {
                await user.delete().catch(() => {});
                toast({
                    variant: "destructive",
                    title: c.label,
                    description: "Si es tuyo y perdiste el acceso, escribinos desde la página de soporte.",
                });
                setIsSubmitting(false);
                return;
            }
        }

        // 🔒 El CUIT ya NO va en el doc de la tienda (seguridad, ago 2026: stores/{id} es
        // de lectura pública — no puede tener identificadores fiscales). Va en el user doc
        // del dueño (privado), junto al DNI. La unicidad la sigue garantizando unique_ids.
        const storeData = {
            name: values.storeName,
            category: values.category,
            address: values.address,
            maintenanceMode: false,
            isApproved: false,      // Requiere aprobación del admin
            // 🔒 'ownerName' ya NO va acá (auditoría de privacidad ago 2026): stores/{id}
            // es de lectura pública y el nombre completo del dueño no pinta nada ahí —
            // vive en su users/{uid} privado (campo `name`). Ninguna pantalla lo usaba.
            createdAt: new Date()
        };

        // TODO EN UN SOLO BATCH ATÓMICO (Fase PP): tienda + perfil + reserva del CUIT.
        // Antes eran 3 writes sueltos: si el primero fallaba (pasó de verdad, ver R1 en
        // CLAUDE.md), la cuenta de Auth quedaba creada sin perfil ni tienda.
        const storeRef = doc(collection(firestore, 'stores'));
        const batch = writeBatch(firestore);
        batch.set(storeRef, buildNewStoreData(user.uid, storeData as any));
        batch.set(doc(firestore, "users", user.uid), {
            uid: user.uid,
            name: values.ownerName,
            displayName: values.ownerName, // FE-C-002
            email: values.email,
            phoneNumber: values.phoneNumber,
            dni: values.dni,
            cuit: cuitDigits, // en el doc privado del dueño (facturación futura)
            role: 'store' as const,
            storeId: storeRef.id,
            isApproved: false
        });
        batch.set(uniqueRef(firestore, 'cuit', cuitDigits), uniquePayload('cuit', cuitDigits, user.uid));
        batch.set(uniqueRef(firestore, 'dni', values.dni), uniquePayload('dni', values.dni, user.uid));
        batch.set(uniqueRef(firestore, 'tel', values.phoneNumber), uniquePayload('tel', values.phoneNumber, user.uid));
        await batch.commit();

        await sendEmailVerification(user);

        toast({
            title: "¡Solicitud de Tienda Enviada!",
            description: "Revisá tu correo para verificar tu cuenta. Tu tienda está pendiente de aprobación.",
        });

        // Recarga completa para reinicializar el contexto de autenticación
        window.location.href = '/';

    } catch (error: any) {
        console.error("Error creating store account:", error);
        // Si la cuenta de Auth llegó a crearse pero Firestore falló, se revierte para no
        // dejar una cuenta a medias (podía loguear sin perfil ni tienda).
        if (createdUser && error?.code !== 'auth/email-already-in-use') {
            await createdUser.delete().catch(() => {});
        }
        toast({
            variant: "destructive",
            title: "Error al Registrarse",
            description: error.code === 'auth/email-already-in-use'
                ? "Este correo electrónico ya está en uso."
                : error.code === 'permission-denied'
                    ? "El CUIT, DNI o teléfono ya tienen una cuenta registrada."
                    : "No se pudo registrar la tienda. Por favor, inténtalo de nuevo.",
        });
    } finally {
        setSignupInProgress(false);
        setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen
      testId="signup-store-card"
      title="Registrá tu tienda"
      description="Completá los datos de tu negocio. Un administrador lo revisa y te avisamos cuando quede aprobado."
      footer={
        <>
          <p>
            ¿Ya tenés una cuenta?{" "}
            <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">Iniciá sesión</Link>
          </p>
          {/* Tanda B: solo el alta de comprador mostraba el consentimiento legal. */}
          <p className="text-sm">
            Al registrarte aceptás nuestros{' '}
            <Link href="/terms" className="font-semibold underline underline-offset-4">Términos</Link> y la{' '}
            <Link href="/privacy" className="font-semibold underline underline-offset-4">Política de Privacidad</Link>.
          </p>
        </>
      }
    >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} method="post" action="#" className="grid gap-4">
              <AuthGroupTitle>Tu negocio</AuthGroupTitle>
              <FormField
                control={form.control}
                name="storeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la tienda</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Paraíso de la Pizza" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rubro</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí el rubro" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STORE_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Calle Pizza 123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cuit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT del negocio</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. 20-12345678-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="mt-2 border-t border-foreground/10 pt-4"><AuthGroupTitle>Tus datos</AuthGroupTitle></div>
              <FormField
                control={form.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tu nombre y apellido</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Juana Pérez" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tu DNI</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="Sin puntos" {...field} />
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
                    <FormLabel>Tu teléfono / WhatsApp</FormLabel>
                    <FormControl>
                      <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="Ej. 3834123456" {...field} />
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
                    <FormLabel>Correo electrónico de la cuenta</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" inputMode="email" placeholder="nombre@ejemplo.com" {...field} />
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
                {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" />Registrando tienda...</> : "Registrar mi tienda"}
              </Button>
          </form>
        </Form>
    </AuthScreen>
  );
}
