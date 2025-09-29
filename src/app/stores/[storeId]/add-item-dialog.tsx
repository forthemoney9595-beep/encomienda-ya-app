'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addProductToStore } from "@/lib/data-service";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";

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
  const [categorySearch, setCategorySearch] = useState('');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      category: "",
    },
  });
  
  const categoryOptions = useMemo(() => {
    const existingOptions = productCategories.map(cat => ({ value: cat.toLowerCase(), label: cat }));
    const searchValueLower = categorySearch.toLowerCase();
    
    // If the search term doesn't exactly match an existing category, add it as a "Create new" option
    if (categorySearch && !existingOptions.some(opt => opt.value === searchValueLower)) {
      return [
        { value: searchValueLower, label: `Crear nueva categoría: "${categorySearch}"` },
        ...existingOptions
      ];
    }
    return existingOptions;
  }, [productCategories, categorySearch]);


  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await addProductToStore(storeId, values);
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Añadir Nuevo Artículo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Añadir Nuevo Artículo</DialogTitle>
              <DialogDescription>
                Rellena los detalles del nuevo producto. Haz clic en guardar cuando hayas terminado.
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
                      <Input placeholder="Pizza Margarita" {...field} />
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
                      <Textarea placeholder="Queso clásico y tomate" {...field} />
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
                      <Input type="number" step="0.01" placeholder="12.99" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
