'use client';

import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreVertical, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateDeliveryPersonnelStatus } from '@/lib/data-service';
import { useToast } from '@/hooks/use-toast';
import { getPlaceholderImage } from '@/lib/placeholder-images';

interface DeliveryPersonnelListProps {
    initialPersonnel: DeliveryPersonnel[];
}

export function DeliveryPersonnelList({ initialPersonnel }: DeliveryPersonnelListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>(initialPersonnel);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);


  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    setIsUpdating(personnelId);
    try {
      await updateDeliveryPersonnelStatus(personnelId, status);
      
      // Update local state to immediately reflect the change
      setPersonnel(currentPersonnel => 
        currentPersonnel.map(p => 
          p.id === personnelId ? { ...p, status: status === 'approved' ? 'Activo' : 'Rechazado' } : p
        )
      );

      toast({
        title: '¡Éxito!',
        description: `El repartidor ha sido ${status === 'approved' ? 'aprobado' : 'rechazado'}.`,
      });

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el estado del repartidor.',
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleRowClick = (driverId: string) => {
    router.push(`/admin/delivery/${driverId}`);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Activo':
        return 'secondary';
      case 'Pendiente':
        return 'default';
      case 'Inactivo':
      case 'Rechazado':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <>
       <div className="mb-6 flex justify-end">
         <Button>
           <PlusCircle className="mr-2 h-4 w-4" />
           Agregar Nuevo Conductor
         </Button>
       </div>
       <Card>
        <CardHeader>
          <CardTitle>Personal de Reparto</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Vehículo</TableHead>
                <TableHead className="hidden md:table-cell">Zona</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.map((driver) => (
                <TableRow key={driver.id} className="cursor-pointer" onClick={() => handleRowClick(driver.id)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={getPlaceholderImage(driver.id, 40, 40)} alt={driver.name} />
                        <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{driver.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{driver.vehicle}</TableCell>
                  <TableCell className="hidden md:table-cell">{driver.zone}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(driver.status)}>{driver.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isUpdating === driver.id}>
                                <MoreVertical className="h-4 w-4" />
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
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert('Editar: Próximamente!')}}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); alert('Eliminar: Próximamente!')}}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
