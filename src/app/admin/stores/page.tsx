import PageHeader from '@/components/page-header';
import { stores } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle } from 'lucide-react';
import Image from 'next/image';

export default function AdminStoresPage() {
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
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Editar</Button>
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
