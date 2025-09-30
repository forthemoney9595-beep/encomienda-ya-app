'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { updateStoreStatus } from '@/lib/data-service';
import type { Store } from '@/lib/placeholder-data';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface StoresListProps {
  initialStores: Store[];
}

export function StoresList({ initialStores }: StoresListProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    setIsUpdating(storeId);
    try {
      await updateStoreStatus(storeId, status);
      toast({
        title: '¡Éxito!',
        description: `La tienda ha sido marcada como ${status.toLowerCase()}.`,
      });
      // Instead of updating local state, we refresh the server data.
      router.refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el estado de la tienda.',
      });
    } finally {
      setIsUpdating(null);
    }
  };

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Todas las Tiendas</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-[100px] sm:table-cell">
                <span className="sr-only">Imagen</span>
              </TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="hidden md:table-cell">Dirección</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialStores.map((store) => (
              <TableRow key={store.id}>
                <TableCell className="hidden sm:table-cell">
                  <Image
                    alt={store.name}
                    className="aspect-square rounded-md object-cover"
                    height="64"
                    src={store.imageUrl}
                    width="64"
                    data-ai-hint={store.imageHint}
                  />
                </TableCell>
                <TableCell className="font-medium">{store.name}</TableCell>
                <TableCell>{store.category}</TableCell>
                <TableCell className="hidden md:table-cell">{store.address}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(store.status)}>{store.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isUpdating === store.id}>
                        <MoreVertical className="h-4 w-4" />
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
                      <DropdownMenuItem>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
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
  );
}
