'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import PageHeader from '@/components/page-header';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';


const formSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
});

export default function ProfilePage() {
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });

  useEffect(() => {
    if (!loading && !user) {
        router.push('/login');
    }
    if (user) {
        form.reset({
            name: user.name || "",
            email: user.email || "",
        });
    }
  }, [user, loading, router, form]);


  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
    // En una aplicación real, aquí llamarías a tu API para actualizar los datos.
    toast({
      title: "¡Perfil Actualizado!",
      description: "Tu información ha sido actualizada correctamente.",
    });
  }

  if (loading || !user) {
    return (
        <div className="container mx-auto">
            <PageHeader title="Mi Perfil" description="Gestiona la información de tu cuenta." />
            <Card className="w-full max-w-2xl mx-auto">
                 <CardHeader className="flex-row items-center gap-4">
                    <Skeleton className="h-20 w-20 rounded-full" />
                    <div>
                        <Skeleton className="h-7 w-40 mb-2" />
                        <Skeleton className="h-5 w-48" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-10 w-32" />
                </CardFooter>
            </Card>
        </div>
    )
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="Mi Perfil" description="Gestiona la información de tu cuenta." />
      
      <Card className="w-full max-w-2xl mx-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader className="flex-row items-center gap-4">
                <Avatar className="h-20 w-20">
                    <AvatarImage src={`https://picsum.photos/seed/${user.name}/100/100`} alt={user.name} />
                    <AvatarFallback className="text-2xl">{user.name?.[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                    <CardTitle className="text-2xl">{user.name}</CardTitle>
                    <CardDescription>{user.email}</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
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
            </CardContent>
            <CardFooter>
              <Button type="submit">Guardar Cambios</Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
