
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import type { Store } from '@/lib/placeholder-data';
import { getPlaceholderImage } from '@/lib/placeholder-images';

interface ManageStoreDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSave: (store: Store) => void;
  store: Store | null;
}

const formSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  address: z.string().min(5, 'La dirección debe tener al menos 5 caracteres.'),
  horario: z.string().min(5, 'El horario debe tener al menos 5 caracteres.'),
  category: z.string({ required_error: "Por favor selecciona una categoría." }),
  status: z.enum(['Aprobado', 'Pendiente', 'Rechazado']),
});

type FormData = z.infer<typeof formSchema>;

export function ManageStoreDialog({ isOpen, setIsOpen, onSave, store }: ManageStoreDialogProps) {
  const isEditing = store !== null;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      horario: '',
      category: 'comida-rapida',
      status: 'Pendiente',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (store) {
        form.reset({
            name: store.name,
            address: store.address,
            horario: store.horario,
            category: store.category,
            status: store.status,
        });
      } else {
        form.reset({ name: '', address: '', horario: '', category: 'comida-rapida', status: 'Pendiente' });
      }
    }
  }, [isOpen, store, form]);

  const handleSubmit = (values: FormData) => {
    const storeData: Store = {
      id: isEditing && store ? store.id : `proto-store-${Date.now()}`,
      ownerId: isEditing && store ? store.ownerId : `proto-owner-${Date.now()}`,
      products: isEditing && store ? store.products : [],
      productCategories: isEditing && store ? store.productCategories : [values.category],
      imageUrl: isEditing && store ? store.imageUrl : getPlaceholderImage(values.name, 600, 400),
      imageHint: isEditing && store ? store.imageHint : values.category,
      ...values,
    };
    onSave(storeData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Tienda' : 'Nueva Tienda'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los detalles de la tienda.' : 'Crea una nueva tienda en el sistema.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
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
                  <FormControl><Input placeholder="Ej: Lun-Dom 9am-10pm" {...field} /></FormControl>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                       <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una categoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="italiana">Italiana</SelectItem>
                            <SelectItem value="comida-rapida">Comida Rápida</SelectItem>
                            <SelectItem value="japonesa">Japonesa</SelectItem>
                            <SelectItem value="mexicana">Mexicana</SelectItem>
                            <SelectItem value="saludable">Saludable</SelectItem>
                            <SelectItem value="dulces">Dulces</SelectItem>
                            <SelectItem value="Ropa">Ropa</SelectItem>
                            <SelectItem value="Otros">Otros</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                       <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un estado" />
                          </Trigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="Aprobado">Aprobado</SelectItem>
                            <SelectItem value="Pendiente">Pendiente</SelectItem>
                            <SelectItem value="Rechazado">Rechazado</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
