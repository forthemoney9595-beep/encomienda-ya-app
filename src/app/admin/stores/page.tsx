'use client';

import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreVertical, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getStores, updateStoreStatus } from '@/lib/data-service';
import type { Store } from '@/lib/placeholder-data';
import { useToast } from '@/hooks/use-toast';

export default function AdminStoresPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStores = async () => {
    setLoading(true);
    const storesFromDb = await getStores();
    setStores(storesFromDb);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/login');
    }
  }, [user, isAdmin, authLoading, router]);

  useEffect(() => {
    if (isAdmin) {
      fetchStores();
    }
  }, [isAdmin]);
  
  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    try {
      await updateStoreStatus(storeId, status);
      toast({
        title: '¡Éxito!',
        description: `La tienda ha sido marcada como ${status.toLowerCase()}.`,
      });
      // Refresh the list
      await fetchStores();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el estado de la tienda.',
      });
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

  if (authLoading || loading || !isAdmin) {
    return (
       <div className="container mx-auto">
        <PageHeader title="Gestión de Tiendas" description="Agrega, edita o elimina cuentas de tiendas." />
         <Card>
           <CardHeader>
             <CardTitle>Todas las Tiendas</CardTitle>
           </CardHeader>
           <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
           </CardContent>
         </Card>
       </div>
    );
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Tiendas" description="Agrega, edita o elimina cuentas de tiendas.">
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Nueva Tienda
        </Button>
      </PageHeader>
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
              {stores.map((store) => (
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
                            <Button variant="ghost" size="icon">
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
    </div>
  );
}
