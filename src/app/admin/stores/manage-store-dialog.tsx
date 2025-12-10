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
import { useAuth } from '@/context/auth-context';
import type { Store } from '@/lib/placeholder-data';

interface ManageStoreDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSave: (store: Store) => void;
  store: Store | null;
}

const formSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  address: z.string().min(5, 'La dirección es obligatoria.'),
  status: z.enum(['Aprobado', 'Pendiente', 'Rechazado']),
});

type FormData = z.infer<typeof formSchema>;

export function ManageStoreDialog({ isOpen, setIsOpen, onSave, store }: ManageStoreDialogProps) {
  const { user } = useAuth();
  const isEditing = store !== null;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      status: 'Pendiente',
    },
  });

  useEffect(() => {
    if (isOpen) {
        if (store) {
            // Modo Edición: Cargar datos existentes
            form.reset({
                name: store.name,
                address: store.address,
                // 🛠️ CORRECCIÓN TS: Usamos 'as any' porque 'status' es nuevo en la BD
                status: (store as any).status || 'Pendiente',
            });
        } else {
            // Modo Creación: Limpiar formulario
            form.reset({
                name: '',
                address: '',
                status: 'Pendiente',
            });
        }
    }
  }, [isOpen, store, form]);

  const handleSubmit = (values: FormData) => {
    if (!user) {
        console.error("No se puede crear tienda sin usuario autenticado");
        return;
    }

    const baseData = store || {}; 

    // 🛠️ CORRECCIÓN TS: Definimos storeData como 'any' para poder agregar userId sin errores
    const storeData: any = {
      ...baseData, 
      ...values,   
      
      // 🛠️ CORRECCIÓN TS: Accedemos a userId con 'as any'
      userId: (store as any)?.userId || user.uid,
    };
    
    onSave(storeData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Tienda' : 'Nueva Tienda'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los detalles de la tienda.' : 'Registra un nuevo comercio y vinculalo a tu cuenta.'}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un estado" />
                          </SelectTrigger>
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
                {isEditing ? 'Guardar Cambios' : 'Crear Tienda'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}