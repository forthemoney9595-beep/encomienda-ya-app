
'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Edit } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addProductToStore, updateProductInStore } from "@/lib/data-service";
import type { Product } from "@/lib/placeholder-data";

const formSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres."),
  price: z.coerce.number().positive("El precio debe ser un número positivo."),
  category: z.string().min(1, "Por favor, especifica una categoría."),
});

interface ManageItemDialogProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    storeId: string;
    product: Product | null; // null for creating, product object for editing
}

export function ManageItemDialog({ isOpen, setIsOpen, storeId, product }: ManageItemDialogProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const isEditing = product !== null;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      category: "",
    },
  });

  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        price: 0,
        category: "",
      });
    }
  }, [product, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsProcessing(true);
    
    try {
      const productData = {
        ...values,
        imageUrl: product?.imageUrl || `https://picsum.photos/seed/${values.name.replace(/\s/g, '')}/200/200`,
      };

      if (isEditing) {
        await updateProductInStore(storeId, product.id, productData);
        toast({
          title: "¡Artículo Actualizado!",
          description: `El artículo "${values.name}" ha sido actualizado correctamente.`,
        });
      } else {
        await addProductToStore(storeId, productData);
        toast({
          title: "¡Artículo Guardado!",
          description: `El artículo "${values.name}" ha sido añadido correctamente.`,
        });
      }

      window.dispatchEvent(new CustomEvent('products-updated'));
      setIsOpen(false);
      
    } catch (error) {
      console.error("Error managing item:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el artículo. Por favor, inténtalo de nuevo.",
      });
    } finally {
        setIsProcessing(false);
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
                Rellene los detalles del producto.
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
                      <Input placeholder="Ej. Comida Rápida, Bebidas" {...field} disabled={isProcessing} />
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
