
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
import { useRouter } from 'next/navigation';
import { useAuth as useFirebaseAuthContext } from '@/context/auth-context';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { prototypeUsers } from '@/lib/placeholder-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const formSchema = z.object({
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
  password: z.string().min(1, "La contraseña no puede estar vacía."),
});

export default function LoginPage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!auth) {
        toast({ variant: "destructive", title: "Error", description: "El servicio de autenticación no está disponible." });
        return;
    }
    setIsSubmitting(true);
    form.clearErrors();

    try {
        await signInWithEmailAndPassword(auth, values.email, values.password);
        toast({
            title: "¡Sesión Iniciada!",
            description: "Has iniciado sesión correctamente.",
        });
        router.push('/');
        router.refresh(); // Force a refresh to ensure layout updates
    } catch (error: any) {
        console.error("Error signing in:", error);
        toast({
            variant: "destructive",
            title: "Error al Iniciar Sesión",
            description: "Las credenciales son incorrectas o el usuario no existe.",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center gap-6">
        <Card className="w-full max-w-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
                <CardDescription>
                  Ingresa tu correo electrónico a continuación para iniciar sesión en tu cuenta.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
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
              </CardContent>
              <CardFooter className="flex flex-col">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Iniciando Sesión...</> : "Iniciar Sesión"}
                </Button>
                <div className="mt-4 text-center text-sm">
                  ¿No tienes una cuenta?{" "}
                  <Link href="/signup" className="underline">
                    Regístrate
                  </Link>
                </div>
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        <Card className="w-full max-w-lg">
            <CardHeader>
                <CardTitle>Cuentas de Prueba Sugeridas</CardTitle>
                <CardDescription>Puedes usar estos correos para registrarte. La contraseña para todas puede ser <Badge variant="secondary" className="font-mono">password</Badge>.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Rol</TableHead>
                            <TableHead>Email</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.values(prototypeUsers).map((user) => (
                            <TableRow key={user.uid}>
                                <TableCell className="font-medium capitalize">{user.role}</TableCell>
                                <TableCell>{user.email}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
