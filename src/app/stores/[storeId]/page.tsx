import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getStoreById, getProductsByStoreId } from '@/lib/placeholder-data';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddItemDialog } from './add-item-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function StoreDetailPage({ params }: { params: { storeId: string } }) {
  const store = getStoreById(params.storeId);
  const products = getProductsByStoreId(params.storeId);

  if (!store) {
    notFound();
  }

  const productCategories = Array.from(new Set(products.map(p => p.category)));

  return (
    <div className="container mx-auto">
      <PageHeader title={store.name} description={store.category}>
        <AddItemDialog />
      </PageHeader>
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue={productCategories[0] || 'all'}>
                    <TabsList className="mb-4">
                      {productCategories.map(category => (
                        <TabsTrigger key={category} value={category}>{category}</TabsTrigger>
                      ))}
                    </TabsList>
                    {productCategories.map(category => (
                      <TabsContent key={category} value={category}>
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">Imagen</TableHead>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Precio</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {products.filter(p => p.category === category).map((product) => (
                                <TableRow key={product.id}>
                                <TableCell>
                                    <Image src={`https://picsum.photos/seed/${product.id}/64/64`} alt={product.name} width={64} height={64} className="rounded-md" data-ai-hint="food item" />
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium">{product.name}</div>
                                    <div className="text-sm text-muted-foreground">{product.description}</div>
                                </TableCell>
                                <TableCell>${product.price.toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                        <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
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
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
            </Card>
        </div>
        <div className="md:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>Información de la Tienda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative h-48 w-full">
                        <Image
                        src={store.imageUrl}
                        alt={store.name}
                        fill
                        style={{ objectFit: 'cover' }}
                        className="rounded-md"
                        data-ai-hint={store.imageHint}
                        />
                    </div>
                    <div>
                        <h3 className="font-semibold">Dirección</h3>
                        <p className="text-muted-foreground">{store.address}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold">Horario</h3>
                        <p className="text-muted-foreground">Lun-Dom: 11:00 AM - 10:00 PM</p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
