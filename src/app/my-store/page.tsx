
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Loader2, UploadCloud, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Store } from '@/lib/placeholder-data';
import Image from 'next/image';
import { uploadImage } from '@/lib/upload-service';
import { Progress } from '@/components/ui/progress';

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
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const isPrototypeMode = user?.uid.startsWith('proto-') ?? false;

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: "", address: "", horario: "", imageUrl: "" },
    });
    
    const imageUrlValue = form.watch('imageUrl');

    useEffect(() => {
        if (authLoading || prototypeLoading) return;

        if (!user || user.role !== 'store') {
            toast({ variant: 'destructive', title: 'Acceso Denegado', description: 'No tienes permisos para ver esta página.' });
            router.push('/');
            return;
        }

        if (!user.storeId) {
             toast({ variant: 'destructive', title: 'Acceso Denegado', description: 'No tienes una tienda asignada.' });
             router.push('/');
             return;
        }

        async function fetchStore() {
            setLoading(true);
            let storeData: Store | null | undefined = null;
            if (isPrototypeMode) {
                storeData = getPrototypeStoreById(user.storeId!);
            } else {
                // In real mode, you'd fetch from your DB
                // storeData = await getStoreFromDB(user.storeId!);
            }

            if (storeData) {
                setStore(storeData);
                form.reset({
                    name: storeData.name,
                    address: storeData.address,
                    horario: storeData.horario,
                    imageUrl: storeData.imageUrl,
                });
                setPreviewImage(storeData.imageUrl);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar tu tienda.' });
                router.push('/');
            }
            setLoading(false);
        }

        fetchStore();
    }, [user, authLoading, prototypeLoading, router, toast, form, isPrototypeMode, getPrototypeStoreById]);

     const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setPreviewImage(URL.createObjectURL(file));
            setIsUploading(true);
            setUploadProgress(0);

            try {
                const downloadURL = await uploadImage(file, (progress) => {
                    setUploadProgress(progress);
                });
                form.setValue('imageUrl', downloadURL, { shouldValidate: true });
                toast({ title: '¡Imagen Subida!', description: 'La imagen se ha subido y la URL se ha guardado.' });
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error de Subida', description: error.message || 'No se pudo subir la imagen.' });
                setPreviewImage(store?.imageUrl || null);
            } finally {
                setIsUploading(false);
            }
        }
    }, [form, toast, store]);


    async function onSubmit(values: FormData) {
        if (!user?.storeId || !store) return;
        
        setIsSubmitting(true);
        try {
            if (isPrototypeMode) {
                // We only update fields from this form, preserving the rest of the store data
                const updatedStoreData = {
                    ...store,
                    ...values
                };
                updatePrototypeStore(updatedStoreData);
            } else {
                // await updateStoreDataInDB(user.storeId, { ...values });
            }
            toast({ title: '¡Tienda Actualizada!', description: 'La información de tu tienda ha sido guardada.' });
            router.push(`/stores/${user.storeId}`);

        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
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
                                <FormControl>
                                <div className="space-y-2">
                                    <Input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" disabled={isUploading || isSubmitting} />
                                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isSubmitting}>
                                        <UploadCloud className="mr-2 h-4 w-4" />
                                        {isUploading ? 'Subiendo...' : 'Cambiar Imagen'}
                                    </Button>
                                    {(isUploading) && (
                                        <Progress value={uploadProgress} className="w-full h-2" />
                                    )}
                                </div>
                                </FormControl>
                                {(previewImage || imageUrlValue) && (
                                <div className="relative mt-4 h-48 w-full max-w-sm rounded-md border-2 border-dashed">
                                    <Image src={previewImage || imageUrlValue || ''} alt="Vista previa" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                                </div>
                                )}
                                <FormMessage />
                            </FormItem>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSubmitting || isUploading}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Cambios
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
