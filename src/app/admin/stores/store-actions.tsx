'use client';

import type { Store } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MoreVertical, Edit, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface StoreActionsProps {
    store: Store;
    onStatusUpdate: (storeId: string, status: 'Aprobado' | 'Rechazado') => void;
    onEdit: (store: Store) => void;
    onDelete: (storeId: string) => void;
}

export function StoreActions({ store, onStatusUpdate, onEdit, onDelete }: StoreActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    setIsUpdating(true);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    onStatusUpdate(storeId, status);
    setIsUpdating(false);
  };

  return (
    <AlertDialog>
      <DropdownMenu>
          <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
              </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
              {store.status === 'Pendiente' && (
                <>
                  <DropdownMenuItem onClick={() => handleStatusUpdate(store.id, 'Aprobado')}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Aprobar
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => handleStatusUpdate(store.id, 'Rechazado')}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Rechazar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => onEdit(store)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
              </DropdownMenuItem>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                </DropdownMenuItem>
              </AlertDialogTrigger>
          </DropdownMenuContent>
      </DropdownMenu>
       <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro que quieres eliminar la tienda {store.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente la tienda y todos sus productos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onDelete(store.id)}>Sí, eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
