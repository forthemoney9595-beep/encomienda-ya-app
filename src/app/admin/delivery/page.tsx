'use client';

import PageHeader from '@/components/page-header';
import { deliveryPersonnel } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreVertical, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';


export default function AdminDeliveryPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push('/login');
    }
  }, [user, isAdmin, loading, router]);


  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Activo':
        return 'secondary';
      case 'Pendiente':
        return 'default';
      case 'Inactivo':
        return 'outline';
      default:
        return 'destructive';
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="container mx-auto">
         <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto." />
         <Card>
           <CardHeader>
             <CardTitle>Personal de Reparto</CardTitle>
           </CardHeader>
           <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
           </CardContent>
         </Card>
       </div>
    );
  }


  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto.">
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Nuevo Conductor
        </Button>
      </PageHeader>
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
              {deliveryPersonnel.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={`https://picsum.photos/seed/${driver.id}/40/40`} alt={driver.name} />
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
                  <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {driver.status === 'Pendiente' && (
                              <>
                                <DropdownMenuItem>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Aprobar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">
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
