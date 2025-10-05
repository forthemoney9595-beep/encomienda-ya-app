

'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
    const [isUploading, setIsUploading] = useState(false);
    
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: "", address: "", horario: "", imageUrl: "" },
    });
    
    const imageUrlValue = form.watch('imageUrl');

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
            setPreviewImage(storeData.imageUrl);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar tu tienda.' });
            router.push('/');
        }
        setLoading(false);
    }, [user, authLoading, prototypeLoading, router, toast, form, getPrototypeStoreById]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Por favor, selecciona un archivo de imagen.' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast({ variant: 'destructive', title: 'Archivo demasiado grande', description: 'La imagen no puede superar los 5MB.' });
            return;
        }
        
        setSelectedFile(file);
        setPreviewImage(URL.createObjectURL(file));
    };

    const handleImageUpload = async () => {
        if (!selectedFile || !user?.storeId) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('path', `store-images/${user.uid}`);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'La subida de imagen ha fallado.');
            }

            const { imageUrl } = await response.json();
            form.setValue('imageUrl', imageUrl);
            setPreviewImage(imageUrl);
            setSelectedFile(null); // Clear selected file after successful upload
            toast({ title: 'Imagen Subida', description: 'La nueva imagen está lista. Guarda los cambios para aplicarla.' });
        } catch (error: any) {
            console.error("¡ERROR FATAL DURANTE LA SUBIDA!", error);
            toast({ variant: 'destructive', title: 'Error de Subida', description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    async function onSubmit(values: FormData) {
        if (!store) return;
        
        setIsSubmitting(true);
        try {
            const updatedStoreData: Store = {
                ...store,
                name: values.name,
                address: values.address,
                horario: values.horario,
                imageUrl: values.imageUrl || store.imageUrl,
            };
            
            await updatePrototypeStore(updatedStoreData);
            
            toast({ title: '¡Información Guardada!', description: 'Los detalles de tu tienda han sido guardados.' });
            router.push(`/stores/${store.id}`);

        } catch (error) {
            console.error("¡ERROR FATAL DURANTE EL GUARDADO!", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la información de la tienda.' });
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
                                {(previewImage || imageUrlValue) && (
                                <div className="relative mt-2 h-48 w-full max-w-sm rounded-md border-2 border-dashed">
                                    <Image src={previewImage || imageUrlValue || ''} alt="Vista previa" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                                </div>
                                )}
                                <div className="flex gap-2 pt-2">
                                    <Input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
                                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                                        <UploadCloud />
                                        Elegir Archivo
                                    </Button>
                                    {selectedFile && (
                                        <Button type="button" onClick={handleImageUpload} disabled={isUploading}>
                                            {isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                                            Subir Nueva Imagen
                                        </Button>
                                    )}
                                </div>
                                <FormMessage />
                            </FormItem>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSubmitting || isUploading}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
                                Guardar Cambios
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
