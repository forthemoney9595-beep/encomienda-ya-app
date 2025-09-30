'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';

const formSchema = z.object({
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
  password: z.string().min(1, "La contraseña no puede estar vacía."),
});

const testUsers = [
    { role: 'Admin', email: 'admin@test.com', password: 'password' },
    { role: 'Tienda', email: 'tienda@test.com', password: 'password' },
    { role: 'Repartidor', email: 'repartidor@test.com', password: 'password' },
    { role: 'Comprador', email: 'comprador@test.com', password: 'password' },
]

export default function LoginPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { loginForPrototype } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast({
        title: "¡Inicio de Sesión Exitoso!",
        description: "Bienvenido de nuevo.",
      });
      router.push('/');
    } catch (error: any) {
      console.log("Firebase login failed, attempting prototype login.", error.code);
      // If Firebase auth fails (e.g., user not found), try prototype login
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
         await loginForPrototype(values.email);
         toast({
            title: "¡Inicio de Sesión Simulado!",
            description: `Modo de prototipo activado para ${values.email}.`,
         });
         router.push('/');
      } else {
        console.error(error);
        toast({
          variant: "destructive",
          title: "Error al Iniciar Sesión",
          description: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo.",
        });
      }
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
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Iniciando Sesión..." : "Iniciar Sesión"}
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
        
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Cuentas de Prueba</CardTitle>
                <CardDescription>Usa estas cuentas para explorar los diferentes roles. La contraseña para todas es <Badge variant="secondary" className="font-mono">password</Badge>.</CardDescription>
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
                        {testUsers.map(user => (
                            <TableRow key={user.role}>
                                <TableCell className="font-medium">{user.role}</TableCell>
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
