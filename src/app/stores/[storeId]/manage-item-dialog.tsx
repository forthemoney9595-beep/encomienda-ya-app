'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Edit, Upload, Image as ImageIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Product } from "@/lib/placeholder-data";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";
import { uploadImage } from "@/lib/upload-service";
import { Progress } from "@/components/ui/progress";

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string().min(1, "Por favor, selecciona una categoría."),
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = product !== null;
  const { toast } = useToast();

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
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          category: productCategories[0] || "",
          imageUrl: "",
        });
      }
    }
  }, [product, form, isOpen, productCategories]);

  async function onSubmit(values: FormData) {
    setIsProcessing(true);

    try {
        const productData: Product = {
          id: isEditing ? product.id : `new-${Date.now()}-${Math.random()}`,
          name: values.name,
          description: values.description,
          price: values.price,
          category: values.category,
          imageUrl: values.imageUrl || `https://picsum.photos/seed/${values.name.replace(/\s/g, '')}/200/200`
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleImageUpload(file);
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
        const downloadURL = await uploadImage(file, (progress) => {
            setUploadProgress(progress);
        });
        form.setValue('imageUrl', downloadURL, { shouldValidate: true });
        toast({
            title: "¡Imagen Subida!",
            description: "La imagen del producto se ha subido correctamente.",
        });
    } catch (error) {
        console.error("Error al subir la imagen:", error);
        toast({
            variant: "destructive",
            title: "Error de Subida",
            description: "No se pudo subir la imagen. Por favor, inténtalo de nuevo.",
        });
    } finally {
        setIsUploading(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isProcessing && !isUploading) setIsOpen(open)}}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => { if (isProcessing || isUploading) e.preventDefault() }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Editar Artículo' : 'Añadir Nuevo Artículo'}</DialogTitle>
              <DialogDescription>
                Rellena los detalles del producto. Sube una imagen o pega una URL para la foto del producto.
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isProcessing}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {productCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
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
                      <Input type="number" step="0.01" placeholder="12.99" {...field} disabled={isProcessing} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormItem>
                <FormLabel>Imagen del Producto</FormLabel>
                <FormControl>
                    <>
                        <div 
                            className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {isUploading ? (
                                <div className="flex flex-col items-center justify-center w-full px-4">
                                  <Loader2 className="w-8 h-8 mb-2 text-primary animate-spin" />
                                  <p className="mb-2 text-sm text-muted-foreground">Subiendo...</p>
                                  <Progress value={uploadProgress} className="w-full h-2" />
                                </div>
                            ) : imageUrlValue ? (
                                 <Image
                                    src={imageUrlValue}
                                    alt="Vista previa de la imagen del producto"
                                    fill
                                    style={{ objectFit: 'cover' }}
                                    className="rounded-md"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                                    <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Haz clic para subir</span> o arrastra y suelta</p>
                                    <p className="text-xs text-muted-foreground">PNG, JPG (MAX. 5MB)</p>
                                </div>
                            )}
                        </div>
                        <Input 
                          ref={fileInputRef}
                          id="file-upload" 
                          type="file" 
                          className="hidden" 
                          onChange={handleFileChange}
                          accept="image/png, image/jpeg"
                          disabled={isUploading}
                        />
                    </>
                </FormControl>
                 <FormMessage />
              </FormItem>

              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>O pega una URL de imagen</FormLabel>
                    <FormControl>
                      <Input placeholder="https://ejemplo.com/imagen.jpg" {...field} disabled={isProcessing || isUploading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
