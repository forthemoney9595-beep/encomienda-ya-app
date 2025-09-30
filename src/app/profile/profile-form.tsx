'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import type { UserProfile } from '@/lib/user';


const formSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
});

interface ProfileFormProps {
    user: UserProfile;
}

export function ProfileForm({ user: initialUser }: ProfileFormProps) {
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialUser.name || "",
      email: initialUser.email || "",
    },
  });

  useEffect(() => {
    if (!loading && !user) {
        router.push('/login');
    }
    // Re-sync form if auth context user changes after initial render
    if (user) {
        form.reset({
            name: user.name || "",
            email: user.email || "",
        });
    }
  }, [user, loading, router, form]);


  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
    // In a real app, here you would call your API to update the data.
    toast({
      title: "¡Perfil Actualizado!",
      description: "Tu información ha sido actualizada correctamente.",
    });
  }

  // The user prop from the server is used for the initial render.
  // The user from `useAuth` is used for subsequent client-side updates.
  const displayUser = user || initialUser;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader className="flex-row items-center gap-4">
              <Avatar className="h-20 w-20">
                  <AvatarImage src={getPlaceholderImage(displayUser.name, 100, 100)} alt={displayUser.name} />
                  <AvatarFallback className="text-2xl">{displayUser.name?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                  <CardTitle className="text-2xl">{displayUser.name}</CardTitle>
                  <CardDescription>{displayUser.email}</CardDescription>
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
  );
}
