
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
import { useHydrated } from '@/hooks/use-hydrated';
import { DOC_FIELDS } from '@/lib/driver-docs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { AuthScreen, AuthSteps, authButton } from '@/components/auth-screen';
import { cn } from '@/lib/utils';
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Bike, Car, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth, useFirestore } from '@/lib/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, type User } from 'firebase/auth';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { ImageUpload } from '@/components/image-upload';
import { isTaken, uniqueRef, uniquePayload } from '@/lib/unique-ids';
import { setSignupInProgress } from '@/lib/signup-flag';

const formSchema = z.object({
  name: z.string().min(5, "Ingresá tu nombre y apellido completos."),
  email: z.string().email("Ingresá un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  phoneNumber: z.string().min(8, "Ingresá un teléfono válido (con código de área).").regex(/^[0-9+\s-]+$/, "Solo números, espacios, + y -."),
  dni: z.string().regex(/^\d{7,8}$/, "El DNI debe tener 7 u 8 números, sin puntos."),
  // CUIT/CUIL (Fase PP): necesario para pagarle en regla (factura/monotributo).
  cuil: z.string().regex(/^\d{2}-?\d{7,8}-?\d{1}$/, "Formato de CUIT/CUIL inválido (ej: 20-12345678-9)."),
  birthDate: z.string().refine((val) => {
    if (!val) return false;
    const birth = new Date(val);
    const age = (Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return age >= 18;
  }, "Tenés que ser mayor de 18 años para ser repartidor."),
  vehicleType: z.enum(["motocicleta", "automovil", "bicicleta"], {
    required_error: "Elegí con qué vas a repartir.",
  }),
  plate: z.string(),
}).refine(
  (v) => v.vehicleType === 'bicicleta' || /^[A-Za-z0-9\s-]{6,10}$/.test(v.plate.trim()),
  { message: "Ingresá la patente del vehículo (ej: AB 123 CD).", path: ['plate'] },
);

// DOC_FIELDS vive en src/lib/driver-docs.ts (compartido con el Perfil — FE-R-003).

export default function SignupDeliveryPage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrated = useHydrated();

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
      cuil: "",
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
    // Anti-carrera con el fallback de auth-context (ver src/lib/signup-flag.ts).
    setSignupInProgress(true);

    let newUser: User | null = null;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const user = userCredential.user;
        newUser = user;

        // Anti multi-cuenta (Fase PP): DNI y teléfono ÚNICOS. El pre-chequeo da el error
        // claro; la garantía real es el create dentro del batch.
        const dupChecks: { type: 'dni' | 'tel'; raw: string; label: string }[] = [
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

        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "users", user.uid), {
            uid: user.uid,
            name: values.name,
            displayName: values.name, // FE-C-002
            email: values.email,
            phoneNumber: values.phoneNumber,
            dni: values.dni,
            cuil: values.cuil.replace(/\D/g, ''),
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
        batch.set(uniqueRef(firestore, 'dni', values.dni), uniquePayload('dni', values.dni, user.uid));
        batch.set(uniqueRef(firestore, 'tel', values.phoneNumber), uniquePayload('tel', values.phoneNumber, user.uid));
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
                    ? "El DNI o el teléfono ya tienen una cuenta registrada."
                    : "No se pudo crear la cuenta. Por favor, inténtalo de nuevo.",
        });
    } finally {
        setSignupInProgress(false);
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
    const uploadedCount = requiredDocs.filter(d => !!docPaths[d.key]).length;
    return (
      <AuthScreen
        testId="signup-delivery-docs"
        size="lg"
        eyebrow={<AuthSteps current={2} total={2} label="Tus documentos" />}
        title="Último paso: tus documentos"
        description={<>Para aprobar tu cuenta necesitamos verificar quién sos{isBike ? '' : ' y el vehículo con el que vas a trabajar'}. Las fotos son privadas: solo las ve el equipo de aprobación.</>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {requiredDocs.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <p className="flex items-center gap-1.5 text-[0.95rem] font-semibold">
                {docPaths[key]
                  ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                  : <span className="h-5 w-5 rounded-full border-2 border-foreground/20" aria-hidden="true" />}
                {label} <span className="text-destructive" aria-hidden="true">*</span>
                {docPaths[key] && <span className="sr-only">(subida)</span>}
              </p>
              <ImageUpload
                ownerId={createdUser.uid}
                folder="licenses"
                variant="banner"
                storeRawPath
                label={label}
                onImageUploaded={(path) => setDocPaths(prev => ({ ...prev, [key]: path }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-2">
          <Button className={authButton} onClick={handleFinishDocs} disabled={!allDocsUploaded || savingDocs}>
            {savingDocs ? <><Loader2 className="h-5 w-5 animate-spin" />Guardando…</> : "Enviar solicitud"}
          </Button>
          <p className="text-center text-sm text-muted-foreground" aria-live="polite">
            {allDocsUploaded
              ? 'Listo: ya podés enviar la solicitud.'
              : 'Subiste ' + uploadedCount + ' de ' + requiredDocs.length + ' fotos. Hacen falta todas para enviar la solicitud.'}
          </p>
        </div>
      </AuthScreen>
    );
  }

  const VEHICLES = [
    { value: 'motocicleta' as const, label: 'Moto', Icon: Bike },
    { value: 'automovil' as const, label: 'Auto', Icon: Car },
    { value: 'bicicleta' as const, label: 'Bici', Icon: Bike },
  ];

  // ── Paso 1: datos de la cuenta ──
  return (
    <AuthScreen
      testId="signup-delivery-card"
      eyebrow={<AuthSteps current={1} total={2} label="Tus datos" />}
      title="Sumate como repartidor"
      description="Registrate para ganar plata llevando pedidos. En el paso siguiente subís tus documentos."
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
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre y apellido</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Ej. Juan Pérez" {...field} />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="dni"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>DNI</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="Sin puntos" {...field} />
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
                    <Input type="date" autoComplete="bday" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="cuil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CUIT / CUIL</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="Ej. 20-12345678-9" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="vehicleType"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>¿Con qué vas a repartir?</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de vehículo">
                    {VEHICLES.map(({ value, label, Icon }) => {
                      const on = field.value === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => field.onChange(value)}
                          className={cn(
                            'flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-base font-semibold transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] motion-reduce:transition-none',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            on ? 'border-primary bg-primary/10 text-foreground' : 'border-foreground/10 bg-background/50 text-muted-foreground hover:bg-primary/5',
                          )}
                        >
                          <Icon className={cn('h-6 w-6', on && 'text-primary')} aria-hidden="true" />
                          {label}
                        </button>
                      );
                    })}
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
                <FormItem className="animate-in fade-in-0 slide-in-from-top-1 duration-300 motion-reduce:animate-none">
                  <FormLabel>Patente del vehículo</FormLabel>
                  <FormControl>
                    <Input autoCapitalize="characters" placeholder="Ej. AB 123 CD" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <Button type="submit" className={authButton + ' mt-1'} disabled={!hydrated || isSubmitting}>
            {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" />Creando cuenta...</> : "Seguir: subir documentos"}
          </Button>
        </form>
      </Form>
    </AuthScreen>
  );
}
