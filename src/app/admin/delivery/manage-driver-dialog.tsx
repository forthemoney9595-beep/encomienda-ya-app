
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
import type { DeliveryPersonnel } from './delivery-personnel-list';

interface ManageDriverDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSave: (driver: DeliveryPersonnel) => void;
  driver: DeliveryPersonnel | null;
}

// Editor unificado (punto 2 de la prueba, 18/8): email SOLO LECTURA (editarlo acá
// desincronizaba con Firebase Auth — el login seguía con el viejo), vehículo con
// TIPO + PATENTE (el modelo real es `{type, plate}`), teléfono editable, y el ESTADO
// se saca del form: se cambia SOLO por Aprobar/Rechazar (que pasan por approval-service,
// Fase PP) — mantener un select suelto acá es la familia de bugs R1.
const VEHICLE_TYPES = [
  { value: 'motocicleta', label: 'Motocicleta' },
  { value: 'automovil', label: 'Automóvil' },
  { value: 'bicicleta', label: 'Bicicleta' },
];
const formSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  phoneNumber: z.string().regex(/^[0-9+\s-]*$/, 'Solo números, espacios, + y -.').optional(),
  vehicleType: z.enum(['motocicleta', 'automovil', 'bicicleta']),
  plate: z.string().max(12, 'Patente demasiado larga.').optional(),
});

type FormData = z.infer<typeof formSchema>;

// Normaliza cualquier forma legacy de `vehicle` (string suelto o objeto) a {type, plate}.
function readVehicle(v: DeliveryPersonnel['vehicle']): { type: FormData['vehicleType']; plate: string } {
  const valid: FormData['vehicleType'][] = ['motocicleta', 'automovil', 'bicicleta'];
  if (typeof v === 'object' && v !== null) {
    const t = valid.includes(v.type as FormData['vehicleType']) ? (v.type as FormData['vehicleType']) : 'motocicleta';
    return { type: t, plate: v.plate || '' };
  }
  if (typeof v === 'string' && valid.includes(v as FormData['vehicleType'])) {
    return { type: v as FormData['vehicleType'], plate: '' };
  }
  return { type: 'motocicleta', plate: '' };
}

export function ManageDriverDialog({ isOpen, setIsOpen, onSave, driver }: ManageDriverDialogProps) {
  const isEditing = driver !== null;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', phoneNumber: '', vehicleType: 'motocicleta', plate: '' },
  });

  useEffect(() => {
    if (isOpen && driver) {
      const v = readVehicle(driver.vehicle);
      form.reset({ name: driver.name, phoneNumber: driver.phoneNumber || '', vehicleType: v.type, plate: v.plate });
    }
  }, [isOpen, driver, form]);

  const handleSubmit = (values: FormData) => {
    if (!driver) return;
    // La bicicleta no lleva patente. El objeto `vehicle` conserva cualquier otro campo
    // legacy (modelo/color) que el repartidor haya cargado.
    const existing = typeof driver.vehicle === 'object' && driver.vehicle !== null ? driver.vehicle : {};
    const vehicle = {
      ...existing,
      type: values.vehicleType,
      plate: values.vehicleType === 'bicicleta' ? '' : (values.plate || '').trim().toUpperCase(),
    };
    // A propósito NO se manda `email` ni `status`: el email es inmutable acá (Auth), el
    // estado se cambia con Aprobar/Rechazar. onSave arma el update con estos campos.
    onSave({
      id: driver.id,
      name: values.name.trim(),
      email: driver.email,
      phoneNumber: (values.phoneNumber || '').trim(),
      vehicle,
      status: driver.status,
      zone: driver.zone,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Repartidor</DialogTitle>
          <DialogDescription>Datos de contacto y vehículo. El estado se cambia con Aprobar/Rechazar.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Repartidor</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Email SOLO LECTURA: editarlo acá no cambia el login (vive en Firebase Auth) */}
            <div className="space-y-1">
              <FormLabel className="text-muted-foreground">Correo Electrónico (no editable)</FormLabel>
              <Input value={driver?.email || ''} readOnly disabled className="bg-muted/50" />
            </div>
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl><Input type="tel" placeholder="Ej. 3834123456" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                  control={form.control}
                  name="vehicleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehículo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {VEHICLE_TYPES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
              />
              <FormField
                  control={form.control}
                  name="plate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patente</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={form.watch('vehicleType') === 'bicicleta' ? 'No aplica' : 'ABC123'}
                          disabled={form.watch('vehicleType') === 'bicicleta'}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
              />
            </div>
            {/* El estado real (Pendiente/Activo/…) se gestiona con Aprobar/Rechazar. */}
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
              Estado actual: <strong>{driver?.status || '—'}</strong>. Para cambiarlo usá
              los botones Aprobar/Rechazar de la lista o la ficha completa del repartidor.
            </div>
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
