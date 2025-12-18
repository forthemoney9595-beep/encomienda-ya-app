'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Store, Loader2, Plus, Search, MapPin, AlertTriangle, Check, Trash2, Edit } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { ManageStoreDialog } from './manage-store-dialog'; // Asegúrate de que la ruta sea correcta

export default function AdminStoresPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  
  // Estados para el Modal
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);

  // 1. Cargar Tiendas
  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') : null, [firestore]);
  const { data: stores, isLoading } = useCollection<any>(storesQuery);

  // 2. Filtrar
  const filteredStores = stores?.filter(s => 
    s.name?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // 3. Manejar Guardado (AQUÍ ESTABA EL ERROR)
  const handleSaveStore = async (storeData: any) => {
      if (!firestore) return;

      try {
          if (selectedStore) {
              // --- MODO EDICIÓN ---
              const storeRef = doc(firestore, 'stores', selectedStore.id);
              
              // ✅ CORRECCIÓN: Aseguramos que commissionRate se guarde
              await updateDoc(storeRef, {
                  name: storeData.name,
                  address: storeData.address,
                  status: storeData.status,
                  isApproved: storeData.isApproved, // Derivado de status === 'Aprobado'
                  commissionRate: Number(storeData.commissionRate), // 👈 ESTO FALTABA
                  updatedAt: serverTimestamp()
              });
              toast({ title: "Tienda actualizada", description: "Los cambios se han guardado." });
          } else {
              // --- MODO CREACIÓN --- (Opcional, si creas tiendas manuales)
              await addDoc(collection(firestore, 'stores'), {
                  ...storeData,
                  commissionRate: Number(storeData.commissionRate),
                  createdAt: serverTimestamp()
              });
              toast({ title: "Tienda creada" });
          }
          setIsDialogOpen(false);
          setSelectedStore(null);
      } catch (error) {
          console.error(error);
          toast({ variant: "destructive", title: "Error al guardar" });
      }
  };

  // 4. Manejar Borrado
  const handleDelete = async (id: string) => {
      if (!firestore || !confirm("¿Seguro que quieres eliminar esta tienda?")) return;
      try {
          await deleteDoc(doc(firestore, 'stores', id));
          toast({ title: "Tienda eliminada" });
      } catch (error) {
          toast({ variant: "destructive", title: "Error al eliminar" });
      }
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="container mx-auto space-y-6">
      <PageHeader title="Gestión de Tiendas" description="Administra comisiones y estados." />

      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar tienda..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {/* Botón opcional para crear tiendas manuales */}
                <Button onClick={() => { setSelectedStore(null); setIsDialogOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Nueva Tienda
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead>Comisión</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredStores.map((store) => (
                        <TableRow key={store.id}>
                            <TableCell className="font-medium flex items-center gap-3">
                                <Avatar className="h-8 w-8 rounded-md">
                                    <AvatarImage src={store.imageUrl} />
                                    <AvatarFallback><Store className="h-4 w-4" /></AvatarFallback>
                                </Avatar>
                                {store.name}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                                <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {store.address}</div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                                    {store.commissionRate || 0}%
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={store.isApproved ? 'default' : 'destructive'} className="text-[10px]">
                                    {store.isApproved ? 'Aprobado' : 'Pendiente/Rechazado'}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => { setSelectedStore(store); setIsDialogOpen(true); }}>
                                        <Edit className="h-4 w-4 text-blue-600" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(store.id)}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

      {/* MODAL DE EDICIÓN */}
      <ManageStoreDialog 
        isOpen={isDialogOpen} 
        setIsOpen={setIsDialogOpen} 
        store={selectedStore} 
        onSave={handleSaveStore} 
      />
    </div>
  );
}