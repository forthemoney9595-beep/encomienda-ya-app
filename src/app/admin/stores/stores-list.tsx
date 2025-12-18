'use client';

import { useState } from 'react';
import type { Store } from '@/lib/placeholder-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Eye, Clock, MapPin, Store as StoreIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StoreActions } from './store-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StoresListProps {
    stores: Store[];
    onStatusUpdate: (storeId: string, status: 'Aprobado' | 'Rechazado') => void;
    onEdit: (store: Store) => void;
    onDelete: (storeId: string) => void;
}

const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Aprobado': return 'secondary';
      case 'Pendiente': return 'default';
      case 'Rechazado': return 'destructive';
      default: return 'outline';
    }
};

export function StoresList({ stores, onStatusUpdate, onEdit, onDelete }: StoresListProps) {
  const [selectedStore, setSelectedStore] = useState<any | null>(null);

  if (!stores) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tiendas Registradas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="hidden md:table-cell">Propietario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">No se encontraron tiendas.</TableCell>
                </TableRow>
              ) : (
                stores.map((store) => (
                  <TableRow key={store.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={store.imageUrl} alt={store.name} />
                            <AvatarFallback>{store.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <Link href={`/stores/${store.id}`} className="font-medium hover:underline">
                             {store.name}
                          </Link>
                        </div>
                      </TableCell>
                    <TableCell className="capitalize">{store.category}</TableCell>
                    <TableCell className="hidden md:table-cell">{store.ownerId}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(store.status)}>{store.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right flex justify-end gap-2 items-center">
                      {/* 👁️ BOTÓN VER DETALLES */}
                      <Button variant="ghost" size="icon" onClick={() => setSelectedStore(store)} title="Ver Detalles">
                          <Eye className="h-4 w-4 text-blue-600" />
                      </Button>

                      <StoreActions
                        store={store}
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

      {/* 🏪 MODAL DE DETALLES DE LA TIENDA */}
      <Dialog open={!!selectedStore} onOpenChange={(open) => !open && setSelectedStore(null)}>
          <DialogContent className="max-w-md">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                      <StoreIcon className="h-5 w-5 text-blue-600" />
                      {selectedStore?.name}
                  </DialogTitle>
                  <DialogDescription>{selectedStore?.category} • Dueño: {selectedStore?.ownerId}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                  {/* Portada */}
                  <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted">
                      {selectedStore?.imageUrl ? (
                          <img src={selectedStore.imageUrl} alt="Portada" className="w-full h-full object-cover" />
                      ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">Sin Portada</div>
                      )}
                  </div>

                  {/* Descripción y Dirección */}
                  <div className="text-sm space-y-2">
                      <p className="italic text-muted-foreground">"{selectedStore?.description || 'Sin descripción'}"</p>
                      <div className="flex items-center gap-2 font-medium">
                          <MapPin className="h-4 w-4 text-red-500" />
                          {selectedStore?.address || 'Sin dirección física'}
                      </div>
                  </div>

                  {/* Horarios */}
                  <div className="bg-muted/30 p-3 rounded-lg border flex items-center justify-between">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4 text-green-600" /> Horarios
                      </h4>
                      {(selectedStore as any)?.schedule ? (
                          <Badge variant="outline" className="text-sm">
                              {(selectedStore as any).schedule.open} - {(selectedStore as any).schedule.close}
                          </Badge>
                      ) : (
                          <span className="text-xs text-muted-foreground">No definidos</span>
                      )}
                  </div>

                  {/* Botones de Acción */}
                  {selectedStore && (
                    <div className="flex gap-2 pt-2">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
                            onStatusUpdate(selectedStore.id, 'Aprobado');
                            setSelectedStore(null);
                        }}>
                            Aprobar Tienda
                        </Button>
                        <Button variant="destructive" className="w-full" onClick={() => {
                            onStatusUpdate(selectedStore.id, 'Rechazado');
                            setSelectedStore(null);
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