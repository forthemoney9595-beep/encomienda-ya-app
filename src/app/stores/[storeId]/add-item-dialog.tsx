'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addProductToStore } from "@/lib/data-service";
import { useRouter } from "next/navigation";
import { getPlaceholderImage } from "@/lib/placeholder-images";

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string().min(1, "Por favor, especifica una categoría."),
  image: z.instanceof(File).optional(),
});

interface AddItemDialogProps {
    storeId: string;
    productCategories: string[];
}

// Function to convert file to data URI
const toDataURL = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});


export function AddItemDialog({ storeId, productCategories }: AddItemDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      category: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsProcessing(true);
    let imageUrl = '';

    try {
      if (values.image) {
        imageUrl = await toDataURL(values.image);
      } else {
        imageUrl = getPlaceholderImage(values.name.replace(/\s/g, ''), 400, 400);
      }
    } catch (error) {
      console.error("Error converting image:", error);
      toast({
        variant: "destructive",
        title: "Error de Imagen",
        description: "No se pudo procesar la imagen. Se usará una de marcador de posición.",
      });
      imageUrl = getPlaceholderImage(values.name.replace(/\s/g, ''), 400, 400);
    }

    try {
      // Exclude the 'image' file object from the data being sent to Firestore
      const { image, ...productData } = values;

      await addProductToStore(storeId, {...productData, imageUrl });
      toast({
        title: "¡Artículo Guardado!",
        description: `El artículo "${values.name}" ha sido añadido correctamente.`,
      });

      // Dispatch a custom event to notify the product list to update
      window.dispatchEvent(new CustomEvent('product-added'));

      setOpen(false);
      form.reset();
      
    } catch (error) {
      console.error("Error adding item:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo añadir el artículo. Por favor, inténtalo de nuevo.",
      });
    } finally {
        setIsProcessing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isProcessing) setOpen(o)}}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Añadir Nuevo Artículo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => { if (isProcessing) e.preventDefault() }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Añadir Nuevo Artículo</DialogTitle>
              <DialogDescription>
                Rellena los detalles y sube una imagen para el nuevo producto.
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
                      <Input placeholder="Ej. Comida Rápida, Bebidas, etc." {...field} disabled={isProcessing} />
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
              <FormField
                control={form.control}
                name="image"
                render={({ field: { onChange, value, ...rest }}) => (
                  <FormItem>
                    <FormLabel>Imagen del Producto</FormLabel>
                    <FormControl>
                      <Input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            onChange(file);
                          }
                        }}
                        {...rest}
                        disabled={isProcessing}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? (
                   <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                   </>
                ) : (
                  <>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Guardar Artículo
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
