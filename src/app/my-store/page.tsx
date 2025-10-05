

'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Store } from '@/lib/placeholder-data';
import Image from 'next/image';

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  address: z.string().min(5, "La dirección debe tener al menos 5 caracteres."),
  horario: z.string().min(5, "El horario debe tener al menos 5 caracteres."),
  imageUrl: z.string().url("Debe ser una URL válida.").optional().or(z.literal('')),
});

type FormData = z.infer<typeof formSchema>;

export default function MyStorePage() {
    const { user, loading: authLoading } = useAuth();
    const { getStoreById: getPrototypeStoreById, updatePrototypeStore, loading: prototypeLoading } = usePrototypeData();
    const router = useRouter();
    const { toast } = useToast();
    
    const [store, setStore] = useState<Store | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: "", address: "", horario: "", imageUrl: "" },
    });
    
    useEffect(() => {
        if (authLoading || prototypeLoading) return;

        if (!user || user.role !== 'store' || !user.storeId) {
            router.push('/');
            return;
        }

        const storeData = getPrototypeStoreById(user.storeId);

        if (storeData) {
            setStore(storeData);
            form.reset({
                name: storeData.name,
                address: storeData.address,
                horario: storeData.horario,
                imageUrl: storeData.imageUrl,
            });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar tu tienda.' });
            router.push('/');
        }
        setLoading(false);
    }, [user, authLoading, prototypeLoading, router, toast, form, getPrototypeStoreById]);

    async function onSubmit(values: FormData) {
        if (!store) return;
        
        setIsSaving(true);
        
        try {
            const updatedStoreData: Store = {
                ...store,
                name: values.name,
                address: values.address,
                horario: values.horario,
            };
            
            await updatePrototypeStore(updatedStoreData);
            
            toast({ title: '¡Información Guardada!', description: 'Los detalles de tu tienda han sido actualizados.' });

        } catch (error) {
            console.error("Error al guardar la información de la tienda:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Error al Guardar', 
                description: 'No se pudo guardar la información de la tienda.' 
            });
        } finally {
            setIsSaving(false);
        }
    }
    
    if (loading || authLoading || prototypeLoading) {
        return (
            <div className="container mx-auto">
                <PageHeader title="Editar Mi Tienda" description="Actualiza la información de tu negocio." />
                <Card>
                    <CardHeader><Skeleton className="h-7 w-48" /></CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </CardContent>
                    <CardFooter><Skeleton className="h-10 w-32" /></CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto">
            <PageHeader title="Editar Mi Tienda" description="Actualiza la información de tu negocio." />
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Información General</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre de la Tienda</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
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
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="horario"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Horario</FormLabel>
                                        <FormControl><Input placeholder="Ej: Lun-Vie: 9am-10pm" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormItem>
                                <FormLabel>Imagen Principal de la Tienda</FormLabel>
                                {store?.imageUrl && (
                                <div className="relative mt-2 h-48 w-full max-w-sm rounded-md border">
                                    <Image src={store.imageUrl} alt="Vista previa" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                                </div>
                                )}
                                <FormDescription>
                                  La subida de nuevas imágenes está deshabilitada temporalmente. La imagen actual de la tienda se mantendrá.
                                </FormDescription>
                            </FormItem>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                                Guardar Cambios
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
