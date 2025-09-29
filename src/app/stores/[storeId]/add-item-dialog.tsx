'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Wand2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addProductToStore } from "@/lib/data-service";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";
import { generateProductImage } from "@/ai/flows/generate-product-image";

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string().min(1, "Por favor, selecciona o crea una categoría."),
});

interface AddItemDialogProps {
    storeId: string;
    productCategories: string[];
}

export function AddItemDialog({ storeId, productCategories }: AddItemDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingState, setProcessingState] = useState('');


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
        setProcessingState('Generando imagen del producto...');
        const imageResult = await generateProductImage({
            productName: values.name,
            productDescription: values.description,
        });
        imageUrl = imageResult.imageUrl;
    } catch (error) {
        console.error("Error al generar la imagen:", error);
        toast({
            variant: "destructive",
            title: "Error de IA",
            description: "No se pudo generar la imagen del producto. Se usará una imagen de marcador de posición.",
        });
    }

    try {
      setProcessingState('Guardando producto...');
      await addProductToStore(storeId, {...values, imageUrl: imageUrl || `https://picsum.photos/seed/${values.name.replace(/\s/g, '')}/400/400` });
      toast({
        title: "¡Artículo Guardado!",
        description: `El artículo "${values.name}" ha sido añadido correctamente.`,
      });
      setOpen(false);
      form.reset();
      router.refresh(); // Vuelve a cargar los datos del servidor para esta ruta
    } catch (error) {
      console.error("Error al añadir el artículo:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo añadir el artículo. Por favor, inténtalo de nuevo.",
      });
    } finally {
        setIsProcessing(false);
        setProcessingState('');
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
                Rellena los detalles del nuevo producto. Se generará una imagen con IA.
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
                   <FormItem className="flex flex-col">
                    <FormLabel>Categoría</FormLabel>
                    <Combobox
                        options={productCategories.map(cat => ({ value: cat, label: cat }))}
                        value={field.value}
                        onChange={(value) => {
                            form.setValue('category', value, { shouldValidate: true });
                        }}
                        placeholder="Selecciona o crea una categoría"
                        emptyMessage="No se encontraron categorías."
                        disabled={isProcessing}
                    />
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
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? (
                   <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {processingState}
                   </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Guardar y Generar Imagen
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
