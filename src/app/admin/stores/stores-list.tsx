'use client';

import type { Store } from '@/lib/placeholder-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import Link from 'next/link';
import { StoreActions } from './store-actions';

interface StoresListProps {
    stores: Store[];
    onStatusUpdate: (storeId: string, status: 'Aprobado' | 'Rechazado') => void;
    onEdit: (store: Store) => void;
    onDelete: (storeId: string) => void;
}

const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Aprobado':
        return 'secondary';
      case 'Pendiente':
        return 'default';
      case 'Rechazado':
        return 'destructive';
      default:
        return 'outline';
    }
};

export function StoresList({ stores, onStatusUpdate, onEdit, onDelete }: StoresListProps) {
  
  if (!stores) {
    return null;
  }

  return (
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
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No se encontraron tiendas.
                </TableCell>
              </TableRow>
            ) : (
              stores.map((store) => (
                <TableRow key={store.id}>
                    <TableCell>
                      <Link href={`/stores/${store.id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar>
                          <AvatarImage src={store.imageUrl} alt={store.name} />
                          <AvatarFallback>{store.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{store.name}</span>
                      </Link>
                    </TableCell>
                  <TableCell className="capitalize">{store.category}</TableCell>
                  <TableCell className="hidden md:table-cell">{store.ownerId}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(store.status)}>{store.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
  );
}
