'use client';

import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateDeliveryPersonnelStatus } from '@/lib/data-service';
import { useToast } from '@/hooks/use-toast';

interface PersonnelActionsProps {
    driver: DeliveryPersonnel;
}

export function PersonnelActions({ driver }: PersonnelActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    setIsUpdating(true);
    try {
      await updateDeliveryPersonnelStatus(personnelId, status);
      toast({
        title: '¡Éxito!',
        description: `El repartidor ha sido ${status === 'approved' ? 'aprobado' : 'rechazado'}.`,
      });
      router.refresh(); // Vuelve a cargar los datos del servidor
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el estado del repartidor.',
      });
    } finally {
      setIsUpdating(false);
    }
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
