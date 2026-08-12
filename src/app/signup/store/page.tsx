'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { buildNewStoreData } from '@/lib/user-service';
import { isTaken, uniqueRef, uniquePayload } from '@/lib/unique-ids';
import { setSignupInProgress } from '@/lib/signup-flag';
import { STORE_CATEGORIES } from '@/lib/store-categories';
import { Loader2 } from 'lucide-react';


const formSchema = z.object({
  storeName: z.string().min(3, "El nombre de la tienda debe tener al menos 3 caracteres."),
  category: z.string({ required_error: "Por favor selecciona una categoría." }),
  address: z.string().min(5, "La dirección debe tener al menos 5 caracteres."),
  ownerName: z.string().min(5, "Ingresá tu nombre y apellido completos."),
  phoneNumber: z.string().min(8, "Ingresá un teléfono válido (con código de área).").regex(/^[0-9+\s-]+$/, "Solo números, espacios, + y -."),
  // DNI del dueño (Fase PP): la tienda es un negocio, pero el responsable es una persona.
  dni: z.string().regex(/^\d{7,8}$/, "El DNI debe tener 7 u 8 números, sin puntos."),
  // CUIT: 11 dígitos, con o sin guiones (XX-XXXXXXXX-X) -- se guarda solo el número.
  cuit: z.string().regex(/^\d{2}-?\d{8}-?\d{1}$/, "Formato de CUIT inválido (ej: 20-12345678-9)."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export default function SignupStorePage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

        const storeData = {
            name: values.storeName,
            category: values.category,
            address: values.address,
            cuit: values.cuit, // Para poder facturar el día que haga falta
            maintenanceMode: false,
            isApproved: false,      // Requiere aprobación del admin
            ownerName: values.ownerName,
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
            email: values.email,
            phoneNumber: values.phoneNumber,
            dni: values.dni,
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
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle className="text-2xl">Registrar tu Tienda</CardTitle>
              <CardDescription>
                Rellena los datos para registrar tu negocio en la plataforma. Tu tienda necesitará ser aprobada.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                control={form.control}
                name="storeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la Tienda</FormLabel>
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
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una categoría" />
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
              <hr className="my-2" />
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
                      <Input placeholder="Sin puntos" {...field} />
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
                    <FormLabel>Tu Teléfono / WhatsApp</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="Ej. 3834123456" {...field} />
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
                    <FormLabel>Correo Electrónico de la Cuenta</FormLabel>
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
            </CardContent>
            <CardFooter className="flex flex-col">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando tienda...</> : "Registrar Tienda"}
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