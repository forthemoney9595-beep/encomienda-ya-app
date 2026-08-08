
'use client';

// Alta de repartidor (Fase X + Fase PP). Es el alta que más datos reales necesita: es
// quien entra a la casa de un cliente. Dos pasos:
//   1. Datos + patente → crea la cuenta con el DNI RESERVADO en `unique_ids` (batch
//      atómico: dos cuentas con el mismo DNI son imposibles a nivel de reglas).
//   2. Documentos OBLIGATORIOS antes de poder enviar la solicitud: moto/auto = licencia
//      frente/dorso + selfie con la licencia + cédula del vehículo; bicicleta = DNI
//      frente/dorso + selfie con el DNI. Se suben como PATH crudo (storeRawPath) a la
//      carpeta privada `licenses/{uid}` — el admin los ve por URL firmada de 5 minutos.

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Bike, Car, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, type User } from 'firebase/auth';
import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { ImageUpload } from '@/components/image-upload';

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
  plate: z.string(),
}).refine(
  (v) => v.vehicleType === 'bicicleta' || /^[A-Za-z0-9\s-]{6,10}$/.test(v.plate.trim()),
  { message: "Ingresá la patente del vehículo (ej: AB 123 CD).", path: ['plate'] },
);

// Los documentos requeridos según el vehículo. Los campos de licencia se reusan para el
// DNI cuando es bicicleta (no necesita licencia de conducir) — el rótulo cambia, el campo no.
const DOC_FIELDS = (isBike: boolean) => [
  { key: 'licenseUrl', label: isBike ? 'DNI — frente' : 'Licencia de conducir — frente' },
  { key: 'licenseBackUrl', label: isBike ? 'DNI — dorso' : 'Licencia de conducir — dorso' },
  { key: 'licenseSelfieUrl', label: isBike ? 'Selfie sosteniendo tu DNI' : 'Selfie sosteniendo tu licencia' },
  ...(isBike ? [] : [{ key: 'vehicleDocUrl', label: 'Cédula / papeles del vehículo' }]),
] as { key: string; label: string }[];

export default function SignupDeliveryPage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Paso 2: cuenta ya creada, faltan los documentos.
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [isBike, setIsBike] = useState(false);
  const [docPaths, setDocPaths] = useState<Record<string, string>>({});
  const [savingDocs, setSavingDocs] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phoneNumber: "",
      dni: "",
      birthDate: "",
      plate: "",
    },
  });

  const vehicleType = form.watch('vehicleType');

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!auth || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Los servicios de Firebase no están disponibles." });
        return;
    }
    setIsSubmitting(true);

    let newUser: User | null = null;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const user = userCredential.user;
        newUser = user;

        // Anti multi-cuenta (Fase PP): un DNI = una cuenta de repartidor. El pre-chequeo
        // da el error claro; la garantía real es el create dentro del batch.
        const uniqueRef = doc(firestore, 'unique_ids', `dni_${values.dni}`);
        const existing = await getDoc(uniqueRef);
        if (existing.exists()) {
            await user.delete().catch(() => {});
            toast({
                variant: "destructive",
                title: "Ese DNI ya tiene una cuenta",
                description: "Si es tuyo y perdiste el acceso, escribinos desde la página de soporte.",
            });
            setIsSubmitting(false);
            return;
        }

        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "users", user.uid), {
            uid: user.uid,
            name: values.name,
            email: values.email,
            phoneNumber: values.phoneNumber,
            dni: values.dni,
            birthDate: values.birthDate,
            role: 'delivery' as const,
            // Objeto {type, plate}: los consumidores existentes ya toleran ambas formas
            // (string legacy u objeto) — ver admin/delivery.
            vehicle: values.vehicleType === 'bicicleta'
                ? { type: values.vehicleType }
                : { type: values.vehicleType, plate: values.plate.trim().toUpperCase() },
            status: 'Pendiente',
            isApproved: false,
        });
        batch.set(uniqueRef, { type: 'dni', value: values.dni, uid: user.uid, createdAt: new Date() });
        await batch.commit();

        await sendEmailVerification(user);

        // Paso 2: documentos. La cuenta existe pero la solicitud no está completa hasta
        // que suba todo.
        setIsBike(values.vehicleType === 'bicicleta');
        setCreatedUser(user);

    } catch (error: any) {
        console.error("Error creating delivery account:", error);
        if (newUser && error?.code !== 'auth/email-already-in-use') {
            await newUser.delete().catch(() => {});
        }
        toast({
            variant: "destructive",
            title: "Error al Registrarse",
            description: error.code === 'auth/email-already-in-use'
                ? "Este correo electrónico ya está en uso."
                : error.code === 'permission-denied'
                    ? "Ese DNI ya tiene una cuenta registrada."
                    : "No se pudo crear la cuenta. Por favor, inténtalo de nuevo.",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  const requiredDocs = DOC_FIELDS(isBike);
  const allDocsUploaded = requiredDocs.every(d => !!docPaths[d.key]);

  const handleFinishDocs = async () => {
    if (!firestore || !createdUser || !allDocsUploaded) return;
    setSavingDocs(true);
    try {
        await updateDoc(doc(firestore, 'users', createdUser.uid), docPaths);
        toast({
            title: "¡Solicitud Enviada!",
            description: "Revisá tu correo para verificar la cuenta. Te avisamos cuando el equipo apruebe tu perfil.",
        });
        window.location.href = '/';
    } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los documentos. Probá de nuevo." });
    } finally {
        setSavingDocs(false);
    }
  };

  // ── Paso 2: documentos obligatorios ──
  if (createdUser) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" /> Último paso: tus documentos
            </CardTitle>
            <CardDescription>
              Para aprobar tu cuenta necesitamos verificar quién sos{isBike ? '' : ' y el vehículo con el que vas a trabajar'}.
              Las fotos son privadas: solo las ve el equipo de aprobación.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {requiredDocs.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  {docPaths[key] && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {label} <span className="text-destructive">*</span>
                </Label>
                <ImageUpload
                  ownerId={createdUser.uid}
                  folder="licenses"
                  variant="banner"
                  storeRawPath
                  onImageUploaded={(path) => setDocPaths(prev => ({ ...prev, [key]: path }))}
                />
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" onClick={handleFinishDocs} disabled={!allDocsUploaded || savingDocs}>
              {savingDocs ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando…</> : "Enviar solicitud"}
            </Button>
            {!allDocsUploaded && (
              <p className="text-xs text-muted-foreground text-center">
                Subí {requiredDocs.length === 4 ? 'las 4 fotos' : 'las 3 fotos'} para poder enviar la solicitud.
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Paso 1: datos de la cuenta ──
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
              {vehicleType && vehicleType !== 'bicicleta' && (
                <FormField
                  control={form.control}
                  name="plate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patente del vehículo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. AB 123 CD" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
            <CardFooter className="flex flex-col">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando cuenta...</> : "Continuar → subir documentos"}
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
