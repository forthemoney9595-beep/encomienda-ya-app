'use client';

import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PersonnelActionsProps {
    driver: DeliveryPersonnel;
    onStatusUpdate: (personnelId: string, status: 'approved' | 'rejected') => void;
}

export function PersonnelActions({ driver, onStatusUpdate }: PersonnelActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    setIsUpdating(true);
    await onStatusUpdate(personnelId, status);
    setIsUpdating(false);
  };

  return (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isUpdating}>
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
            <DropdownMenuItem onClick={() => alert('Editar: Próximamente!')}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => alert('Eliminar: Próximamente!')}>
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
  );
}
