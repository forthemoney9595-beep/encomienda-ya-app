'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
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
  /** Fase YY ter: abre el SuspendAccountDialog (una tienda aprobada no se "rechaza" acá). */
  onSuspend?: () => void;
}

const formSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  address: z.string().min(5, 'La dirección es obligatoria.'),
  status: z.enum(['Aprobado', 'Pendiente', 'Rechazado']),
  // ✅ Validación estricta: fuerza a ser número y valida rango
  commissionRate: z.coerce.number().min(0).max(100),
});

type FormData = z.infer<typeof formSchema>;

/** Estado del formulario desde el doc real (stores.status guarda 'Aprobada'/'Rechazada'/'Suspendida'). */
function formStatusOf(store: any): 'Aprobado' | 'Pendiente' | 'Rechazado' {
  if (store?.isApproved) return 'Aprobado';
  return ['Rechazado', 'Rechazada'].includes(store?.status) ? 'Rechazado' : 'Pendiente';
}

export function ManageStoreDialog({ isOpen, setIsOpen, onSave, store, onSuspend }: ManageStoreDialogProps) {
  const { user } = useAuth();
  const isEditing = store !== null;
  // Una tienda aprobada o suspendida NO cambia de estado desde este diálogo (lección R1): la
  // aprobada se suspende con motivo y apelación, y la suspendida se levanta desde su ficha.
  const isSuspended = (store as any)?.status === 'Suspendida' || (store as any)?.suspension?.active === true;
  const statusLocked = isEditing && (!!store?.isApproved || isSuspended);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      status: 'Pendiente',
      commissionRate: 0,
    },
  });

  useEffect(() => {
    if (isOpen) {
        if (store) {
            form.reset({
                name: store.name,
                address: store.address,
                status: formStatusOf(store),
                // Aseguramos que sea número al cargar
                commissionRate: Number(store.commissionRate) || 0,
            });
        } else {
            form.reset({
                name: '',
                address: '',
                status: 'Pendiente',
                commissionRate: 0,
            });
        }
    }
  }, [isOpen, store, form]);

  const handleSubmit = (values: FormData) => {
    if (!user) return;

    const baseData = store || {}; 
    const isApprovedDerived = values.status === 'Aprobado';

    const storeData: any = {
      ...baseData,         
      ...values,           
      isApproved: isApprovedDerived, 
      commissionRate: Number(values.commissionRate), // Forzamos número antes de guardar
      userId: (store as any)?.userId || user.uid,
    };
    
    onSave(storeData);
    // No cerramos setIsOpen aquí, dejamos que el padre lo haga tras guardar
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Tienda' : 'Nueva Tienda'}</DialogTitle>
          <DialogDescription>
            Configura los datos operativos y comerciales de la tienda.
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
            
            <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Estado</FormLabel>
                        {statusLocked ? (
                          <div className="space-y-2" data-testid="store-status-locked">
                            <p className="text-sm">{isSuspended ? 'Suspendida' : 'Aprobada'}</p>
                            {!isSuspended && onSuspend && (
                              <Button type="button" size="sm" variant="outline" className="h-9 text-destructive" onClick={onSuspend} data-testid="dialog-suspend">
                                Suspender…
                              </Button>
                            )}
                            <FormDescription className="text-xs">
                              {isSuspended
                                ? 'Para levantar la suspensión o responder la apelación, abrí la ficha de la tienda.'
                                : 'Desactivar una tienda aprobada es una suspensión: pide motivo y el dueño puede apelar.'}
                            </FormDescription>
                          </div>
                        ) : (
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <SelectItem value="Aprobado">Aprobado</SelectItem>
                            <SelectItem value="Pendiente">Pendiente</SelectItem>
                            <SelectItem value="Rechazado">Rechazado</SelectItem>
                            </SelectContent>
                        </Select>
                        )}
                        <FormMessage />
                    </FormItem>
                    )}
                />

                {/* CAMPO COMISIÓN */}
                <FormField
                    control={form.control}
                    name="commissionRate"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Comisión (%)</FormLabel>
                        <FormControl>
                            <Input type="number" min="0" max="100" step="0.1" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                           Lo que retiene la app. En 0 = usa la comisión por defecto de la
                           plataforma (Configuración) — no significa &quot;gratis&quot;.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            </div>

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