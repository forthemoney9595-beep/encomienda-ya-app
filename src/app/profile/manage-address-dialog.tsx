'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Address } from '@/lib/user';

const addressSchema = z.object({
  label: z.enum(['Casa', 'Oficina', 'Otro'], { required_error: 'Debes seleccionar una etiqueta.' }),
  street: z.string().min(5, 'La calle debe tener al menos 5 caracteres.'),
  city: z.string().min(3, 'La ciudad debe tener al menos 3 caracteres.'),
  postalCode: z.string().min(4, 'El código postal es obligatorio.'),
});

interface ManageAddressDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSave: (address: Address) => void;
  address: Address | null;
}

export function ManageAddressDialog({ isOpen, setIsOpen, onSave, address }: ManageAddressDialogProps) {
  const isEditing = address !== null;

  const form = useForm<z.infer<typeof addressSchema>>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: 'Casa',
      street: '',
      city: '',
      postalCode: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (address) {
        form.reset(address);
      } else {
        form.reset({ label: 'Casa', street: '', city: '', postalCode: '' });
      }
    }
  }, [isOpen, address, form]);

  const handleSubmit = (values: z.infer<typeof addressSchema>) => {
    const newAddress: Address = {
      id: isEditing ? address.id : `addr-${Date.now()}`,
      ...values,
    };
    onSave(newAddress);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Dirección' : 'Añadir Nueva Dirección'}</DialogTitle>
          <DialogDescription>
            Introduce los detalles de la dirección.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiqueta</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una etiqueta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Casa">Casa</SelectItem>
                      <SelectItem value="Oficina">Oficina</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="street"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Calle y Número</FormLabel>
                  <FormControl><Input placeholder="Ej. Calle Falsa 123" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl><Input placeholder="Ej. Springfield" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código Postal</FormLabel>
                  <FormControl><Input placeholder="Ej. 12345" {...field} /></FormControl>
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
    