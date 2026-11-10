
'use client';

import type { DeliveryPersonnel } from './delivery-personnel-list';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MoreVertical, Edit, Trash2, CheckCircle, XCircle, Loader2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/auth-context';

interface PersonnelActionsProps {
    driver: DeliveryPersonnel;
    onStatusUpdate: (personnelId: string, status: 'approved' | 'rejected') => void;
    onEdit: (driver: DeliveryPersonnel) => void;
    onDelete: (driverId: string) => void;
    onSuspend: (driver: DeliveryPersonnel) => void;
}

export function PersonnelActions({ driver, onStatusUpdate, onEdit, onDelete, onSuspend }: PersonnelActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  // Borrar cuentas exige admin 'full' (la API lo rechaza igual): a 'support' no se le muestra.
  const { isFullAdmin } = useAuth();

  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    setIsUpdating(true);
    await onStatusUpdate(personnelId, status);
    setIsUpdating(false);
  };

  return (
    <AlertDialog>
      <DropdownMenu>
          <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground" disabled={isUpdating} aria-label={`Más acciones para ${driver.name || 'el repartidor'}`} data-testid="driver-actions">
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
              </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
              {driver.status === 'Pendiente' && (
                <>
                  <DropdownMenuItem onClick={() => handleStatusUpdate(driver.id, 'approved')}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Aprobar
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => handleStatusUpdate(driver.id, 'rejected')}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Rechazar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {/* Fase YY ter: un repartidor ACTIVO se suspende con motivo (nunca "rechazar"). */}
              {driver.status === 'Activo' && (
                <>
                  <DropdownMenuItem className="text-destructive" onClick={() => onSuspend(driver)} data-testid="menu-suspend">
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Suspender…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => onEdit(driver)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
              </DropdownMenuItem>
              {isFullAdmin && (
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              )}
          </DropdownMenuContent>
      </DropdownMenu>
       <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar a {driver.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente la cuenta del repartidor.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onDelete(driver.id)}>Sí, eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
