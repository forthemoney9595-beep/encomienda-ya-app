
'use client';

import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import Link from 'next/link';
import { PersonnelActions } from './personnel-actions';

interface DeliveryPersonnelListProps {
    personnel: DeliveryPersonnel[];
    onStatusUpdate: (personnelId: string, status: 'approved' | 'rejected') => void;
    onEdit: (driver: DeliveryPersonnel) => void;
    onDelete: (driverId: string) => void;
}

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

export function DeliveryPersonnelList({ personnel, onStatusUpdate, onEdit, onDelete }: DeliveryPersonnelListProps) {
  
  if (!personnel) {
    return null;
  }

  return (
    <>
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
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No se encontró personal de reparto.
                  </TableCell>
                </TableRow>
              ) : (
                personnel.map((driver) => (
                  <TableRow key={driver.id}>
                      <TableCell>
                        <Link href={`/admin/delivery/${driver.id}`} className="flex items-center gap-3 hover:underline">
                          <Avatar>
                            <AvatarImage src={getPlaceholderImage(driver.id, 40, 40)} alt={driver.name} />
                            <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{driver.name}</span>
                        </Link>
                      </TableCell>
                    <TableCell className="capitalize">{driver.vehicle}</TableCell>
                    <TableCell className="hidden md:table-cell">{driver.email}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(driver.status)}>{driver.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PersonnelActions 
                        driver={driver} 
                        onStatusUpdate={onStatusUpdate}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
