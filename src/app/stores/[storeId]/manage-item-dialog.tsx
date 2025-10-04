

'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Edit, UploadCloud } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Product } from "@/lib/placeholder-data";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { storage } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string({ required_error: "Debes seleccionar una categoría."}),
  imageUrl: z.string().url("Debe ser una URL válida.").optional().or(z.literal('')),
});

type FormData = z.infer<typeof formSchema>;

interface ManageItemDialogProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    product: Product | null;
    onSave: (data: Product) => Promise<void>;
    productCategories: string[];
}

export function ManageItemDialog({ isOpen, setIsOpen, product, onSave, productCategories }: ManageItemDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  
  const isEditing = product !== null;
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", price: 0, category: "", imageUrl: "" },
  });

  const imageUrlValue = form.watch('imageUrl');

  useEffect(() => {
    if (isOpen) {
      if (product) {
        form.reset({
          name: product.name,
          description: product.description,
          price: product.price,
          category: product.category,
          imageUrl: product.imageUrl || "",
        });
        setPreviewImage(product.imageUrl || null);
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          category: productCategories[0] || "",
          imageUrl: "",
        });
        setPreviewImage(null);
      }
      setSelectedFile(null);
      setIsSubmitting(false);
    }
  }, [product, form, isOpen, productCategories]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Por favor, selecciona un archivo de imagen.' });
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'Archivo demasiado grande', description: 'La imagen no puede superar los 5MB.' });
        return;
    }

    setSelectedFile(file);
    setPreviewImage(URL.createObjectURL(file));
  };

  async function onSubmit(values: FormData) {
    if (!user || !user.storeId) return;
    setIsSubmitting(true);
    let finalImageUrl = values.imageUrl;

    try {
        if (selectedFile) {
            const storageRef = ref(storage, `product-images/${user.storeId}/${Date.now()}-${selectedFile.name}`);
            await uploadBytes(storageRef, selectedFile);
            finalImageUrl = await getDownloadURL(storageRef);
        }

        const productData: Product = {
          id: isEditing && product ? product.id : `prod-${Date.now()}`,
          name: values.name,
          description: values.description,
          price: values.price,
          category: values.category,
          imageUrl: finalImageUrl || '',
          rating: isEditing && product ? product.rating : 0,
          reviewCount: isEditing && product ? product.reviewCount : 0,
        };

        // Corrected await here
        await onSave(productData);
        setIsOpen(false);

    } catch (error) {
        console.error("Error al guardar el producto:", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo guardar el producto.";
        toast({
            variant: "destructive",
            title: "Error al Guardar",
            description: errorMessage
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isSubmitting) setIsOpen(open)}}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => { if (isSubmitting) e.preventDefault() }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Editar Artículo' : 'Añadir Nuevo Artículo'}</DialogTitle>
              <DialogDescription>
                Rellena los detalles del producto y sube una imagen.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Producto</FormLabel>
                    <FormControl>
                      <Input placeholder="Pizza Margarita" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Queso clásico y tomate" {...field} disabled={isSubmitting} />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isSubmitting || productCategories.length === 0}>
                       <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una categoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {productCategories.length > 0 ? (
                            productCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)
                          ) : (
                             <div className="p-4 text-sm text-center text-muted-foreground">
                                <p>No hay categorías definidas.</p>
                                <Button variant="link" className="p-0 h-auto" onClick={() => { setIsOpen(false); router.push('/my-store/categories'); }}>Añadir una</Button>
                            </div>
                          )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="12.99" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Imagen del Producto</FormLabel>
                <FormControl>
                  <div className="space-y-2">
                    <Input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileChange}
                      accept="image/png, image/jpeg, image/gif"
                      disabled={isSubmitting}
                    />
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting}
                    >
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Seleccionar Archivo
                    </Button>
                  </div>
                </FormControl>
                {(previewImage || imageUrlValue) && (
                  <div className="relative mt-2 h-32 w-full rounded-md border-2 border-dashed">
                      <Image
                          src={previewImage || imageUrlValue || ''}
                          alt="Vista previa de la imagen"
                          fill
                          style={{ objectFit: 'cover' }}
                          className="rounded-md"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                  </div>
                )}
                <FormMessage />
              </FormItem>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || productCategories.length === 0}>
                {isSubmitting ? (
                   <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                   </>
                ) : (
                  <>
                    {isEditing ? <Edit className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    {isEditing ? 'Guardar Cambios' : 'Guardar Artículo'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
