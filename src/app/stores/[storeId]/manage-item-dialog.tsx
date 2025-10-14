

'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Edit, Upload } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Product } from "@/lib/placeholder-data";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { getPlaceholderImage } from "@/lib/placeholder-images";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebaseApp } from "@/firebase";

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string({ required_error: "Debes seleccionar una categoría."}),
  image: z.any().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ManageItemDialogProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    product: Product | null;
    onSave: (data: Product) => Promise<void>;
    productCategories: string[];
    storeId: string;
}

export function ManageItemDialog({ isOpen, setIsOpen, product, onSave, productCategories, storeId }: ManageItemDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const firebaseApp = useFirebaseApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isEditing = product !== null;
  const { toast } = useToast();
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", price: 0, category: "", image: null },
  });

  useEffect(() => {
    if (isOpen) {
      if (product) {
        form.reset({
          name: product.name,
          description: product.description,
          price: product.price,
          category: product.category,
        });
        setPreviewUrl(product.imageUrl || null);
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          category: productCategories[0] || "",
          image: null,
        });
        setPreviewUrl(null);
      }
      setIsSubmitting(false);
    }
  }, [product, form, isOpen, productCategories]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue('image', file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  async function uploadImage(file: File, storeId: string, productId: string): Promise<string> {
    if (!firebaseApp) throw new Error("Firebase no está inicializado.");
    const storage = getStorage(firebaseApp);
    const imageRef = storageRef(storage, `stores/${storeId}/products/${productId}-${file.name}`);
    
    await uploadBytes(imageRef, file);
    const downloadUrl = await getDownloadURL(imageRef);
    return downloadUrl;
  }

  async function onSubmit(values: FormData) {
    setIsSubmitting(true);
    
    try {
        const productId = isEditing && product ? product.id : `prod-${Date.now()}`;
        let imageUrl = product?.imageUrl;

        if (values.image && values.image instanceof File) {
            imageUrl = await uploadImage(values.image, storeId, productId);
        } else if (!isEditing) {
            imageUrl = getPlaceholderImage(values.name);
        }

        if (!imageUrl) {
            throw new Error("La imagen es obligatoria para un nuevo producto.");
        }

        const productData: Product = {
          id: productId,
          name: values.name,
          description: values.description,
          price: values.price,
          category: values.category,
          imageUrl: imageUrl,
          rating: isEditing && product ? product.rating : 0,
          reviewCount: isEditing && product ? product.reviewCount : 0,
        };
        
        await onSave(productData);
        setIsOpen(false);

    } catch (error: any) {
        console.error("Error al guardar el producto:", error);
        toast({ 
            variant: 'destructive', 
            title: 'Error', 
            description: `No se pudo guardar el producto: ${error.message}`
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
                Rellena los detalles y sube una imagen para tu producto.
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
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Imagen del Producto</FormLabel>
                    <div className="relative mt-2 h-40 w-full rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                        {previewUrl ? (
                            <Image src={previewUrl} alt="Vista previa" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                        ) : (
                            <div className="text-center text-muted-foreground">
                                <Upload className="mx-auto h-8 w-8" />
                                <p className="text-sm">Haz clic para subir</p>
                            </div>
                        )}
                        <Input 
                            ref={fileInputRef}
                            type="file" 
                            accept="image/png, image/jpeg, image/webp"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileChange}
                            disabled={isSubmitting}
                        />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || productCategories.length === 0}>
                {isSubmitting ? (
                   <>
                    <Loader2 className="mr-2 animate-spin" />
                    Guardando...
                   </>
                ) : (
                  <>
                    {isEditing ? <Edit className="mr-2" /> : <PlusCircle className="mr-2" />}
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
