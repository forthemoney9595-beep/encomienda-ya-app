'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Car, FileText, Phone, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import Link from 'next/link';
import { PersonnelActions } from './personnel-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Definimos la interfaz localmente para evitar problemas de importación
export interface DeliveryPersonnel {
  id: string;
  name: string;
  email: string;
  status: 'Activo' | 'Inactivo' | 'Pendiente' | 'Rechazado' | string;
  phoneNumber?: string;
  vehicle?: string | { type: string; model: string; plate: string; color: string };
  profileImageUrl?: string;
  licenseUrl?: string;
  joinedDate?: string;
}

interface DeliveryPersonnelListProps {
    personnel: DeliveryPersonnel[];
    onStatusUpdate: (personnelId: string, status: 'approved' | 'rejected') => void;
    onEdit: (driver: DeliveryPersonnel) => void;
    onDelete: (driverId: string) => void;
}

const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Activo': return 'secondary';
      case 'Pendiente': return 'default';
      case 'Inactivo':
      case 'Rechazado': return 'destructive';
      default: return 'outline';
    }
};

export function DeliveryPersonnelList({ personnel, onStatusUpdate, onEdit, onDelete }: DeliveryPersonnelListProps) {
  const [selectedDriver, setSelectedDriver] = useState<DeliveryPersonnel | null>(null);

  if (!personnel) return null;

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
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">No se encontró personal.</TableCell>
                </TableRow>
              ) : (
                personnel.map((driver) => (
                  <TableRow key={driver.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={driver.profileImageUrl || getPlaceholderImage(driver.id, 40, 40)} alt={driver.name} />
                            <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{driver.name}</span>
                        </div>
                      </TableCell>
                    <TableCell className="capitalize">
                        {/* ✅ CORRECCIÓN: Lógica ultra-segura para renderizar texto siempre */}
                        {(() => {
                            if (typeof driver.vehicle === 'string') return driver.vehicle;
                            if (typeof driver.vehicle === 'object' && driver.vehicle !== null) return driver.vehicle.type;
                            return 'Sin datos';
                        })()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{driver.email}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(driver.status)}>{driver.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right flex justify-end gap-2 items-center">
                      <Button variant="ghost" size="icon" onClick={() => setSelectedDriver(driver)} title="Ver Ficha Técnica">
                          <Eye className="h-4 w-4 text-blue-600" />
                      </Button>

                      <PersonnelActions 
                        driver={driver as any} 
                        onStatusUpdate={onStatusUpdate}
                        onEdit={onEdit as any}
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

      {/* 📄 MODAL DE DETALLES DEL CONDUCTOR */}
      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={selectedDriver?.profileImageUrl} />
                        <AvatarFallback>{selectedDriver?.name?.[0]}</AvatarFallback>
                    </Avatar>
                    {selectedDriver?.name}
                </DialogTitle>
                <DialogDescription>ID: {selectedDriver?.id}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" /> {selectedDriver?.email}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" /> {selectedDriver?.phoneNumber || 'Sin teléfono'}
                    </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-lg border">
                    <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <Car className="h-4 w-4 text-orange-600" /> Información del Vehículo
                    </h4>
                    {selectedDriver?.vehicle && typeof selectedDriver.vehicle === 'object' ? (
                        <div className="text-sm space-y-1">
                            <p><strong>Tipo:</strong> {selectedDriver.vehicle.type}</p>
                            <p><strong>Modelo:</strong> {selectedDriver.vehicle.model}</p>
                            <p><strong>Patente/Placa:</strong> <span className="font-mono bg-white px-1 border rounded">{selectedDriver.vehicle.plate}</span></p>
                            <p><strong>Color:</strong> {selectedDriver.vehicle.color}</p>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">
                            {typeof selectedDriver?.vehicle === 'string' ? selectedDriver.vehicle : 'No ha registrado vehículo aún.'}
                        </p>
                    )}
                </div>

                <div className="bg-muted/30 p-3 rounded-lg border">
                    <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-blue-600" /> Licencia de Conducir
                    </h4>
                    {selectedDriver?.licenseUrl ? (
                        <div className="relative h-40 w-full rounded-md overflow-hidden border bg-white">
                             <img 
                                src={selectedDriver.licenseUrl} 
                                alt="Licencia" 
                                className="h-full w-full object-contain"
                             />
                        </div>
                    ) : (
                        <p className="text-sm text-red-500 italic flex items-center gap-1">
                            ⚠️ No ha subido foto de licencia.
                        </p>
                    )}
                </div>

                {selectedDriver && (
                    <div className="flex gap-2 pt-2">
                        <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => {
                            onStatusUpdate(selectedDriver.id, 'approved');
                            setSelectedDriver(null);
                        }}>
                            Aprobar
                        </Button>
                        <Button variant="destructive" className="w-full" onClick={() => {
                            onStatusUpdate(selectedDriver.id, 'rejected');
                            setSelectedDriver(null);
                        }}>
                            Rechazar
                        </Button>
                    </div>
                )}
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}