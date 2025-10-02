

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
import { getPlaceholderImage } from "@/lib/placeholder-images";
import { uploadImage } from "@/lib/upload-service";
import { Progress } from "@/components/ui/progress";
import { useParams } from "next/navigation";

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string().min(1, "Por favor, introduce una categoría."),
  imageUrl: z.string().url("Debe ser una URL válida.").optional().or(z.literal('')),
});

type FormData = z.infer<typeof formSchema>;

interface ManageItemDialogProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    product: Product | null;
    onSave: (data: Product) => void;
    productCategories: string[];
}

export function ManageItemDialog({ isOpen, setIsOpen, product, onSave, productCategories }: ManageItemDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isEditing = product !== null;
  const { toast } = useToast();
  const params = useParams();
  const isPrototypeMode = (params.storeId as string)?.startsWith('proto-');

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      category: "",
      imageUrl: "",
    },
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
      setUploadProgress(0);
      setIsUploading(false);
    }
  }, [product, form, isOpen, productCategories]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPreviewImage(URL.createObjectURL(file));
      setIsUploading(true);
      setUploadProgress(0);
      
      if (isPrototypeMode) {
        const interval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 95) {
              clearInterval(interval);
              return 100;
            }
            return prev + 10;
          });
        }, 150);

        setTimeout(() => {
          clearInterval(interval);
          setUploadProgress(100);
          const randomSeed = file.name + Date.now();
          const placeholderUrl = getPlaceholderImage(randomSeed, 200, 200);
          form.setValue('imageUrl', placeholderUrl, { shouldValidate: true });
          toast({ title: '¡Imagen Subida! (Simulado)', description: 'La imagen de marcador de posición se ha establecido.' });
          setIsUploading(false);
        }, 2000);
      } else {
        try {
          const downloadURL = await uploadImage(file, setUploadProgress);
          form.setValue('imageUrl', downloadURL, { shouldValidate: true });
          toast({ title: '¡Imagen Subida!', description: 'La imagen se ha subido y la URL se ha guardado.' });
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Error de Subida',
            description: error.message || 'No se pudo subir la imagen.',
          });
          setPreviewImage(isEditing ? product?.imageUrl || null : null);
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  async function onSubmit(values: FormData) {
    setIsProcessing(true);

    try {
        const productData: Product = {
          id: isEditing ? product.id : `new-${Date.now()}-${Math.random()}`,
          name: values.name,
          description: values.description,
          price: values.price,
          category: values.category,
          imageUrl: values.imageUrl || getPlaceholderImage(values.name.replace(/\s/g, '')),
          // Add default rating for new products, preserve for existing
          rating: isEditing ? product.rating : 0,
          reviewCount: isEditing ? product.reviewCount : 0,
        };

        onSave(productData);

    } catch (error) {
        console.error("Error al guardar el producto:", error);
        toast({
            variant: "destructive",
            title: "Error al Guardar",
            description: "No se pudo guardar el producto. Por favor, inténtalo de nuevo.",
        });
    } finally {
        setIsProcessing(false);
        setIsOpen(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isProcessing) setIsOpen(open)}}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => { if (isProcessing) e.preventDefault() }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Editar Artículo' : 'Añadir Nuevo Artículo'}</DialogTitle>
              <DialogDescription>
                Rellena los detalles del producto y sube una imagen.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Producto</FormLabel>
                    <FormControl>
                      <Input placeholder="Pizza Margarita" {...field} disabled={isProcessing} />
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
                      <Textarea placeholder="Queso clásico y tomate" {...field} disabled={isProcessing} />
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
                    <FormControl>
                       <Input placeholder="Ej. Pizzas, Bebidas, Postres" {...field} disabled={isProcessing} />
                    </FormControl>
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
                      <Input type="number" step="0.01" placeholder="12.99" {...field} disabled={isProcessing} />
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
                      disabled={isUploading || isProcessing}
                    />
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isProcessing}
                    >
                      <UploadCloud className="mr-2 h-4 w-4" />
                      {isUploading ? 'Subiendo...' : 'Seleccionar Archivo'}
                    </Button>
                    {(isUploading || uploadProgress > 0) && (
                      <div className="flex items-center gap-2">
                        <Progress value={uploadProgress} className="w-full h-2" />
                        <span className="text-xs">{Math.round(uploadProgress)}%</span>
                      </div>
                    )}
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
              <Button type="submit" disabled={isProcessing || isUploading}>
                {isProcessing ? (
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
