'use client';

import { useState, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Store, Loader2, Plus, Search, MapPin, AlertTriangle, Check, Trash2, Edit, Eye, Star, Pause, Download } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { logAdminAction } from '@/lib/admin-audit';
import { downloadCsv } from '@/lib/csv-export';
import { cn } from '@/lib/utils';
import { ManageStoreDialog } from './manage-store-dialog';
import AdminAuthGuard from '../admin-auth-guard';

type StoreFilter = 'all' | 'approved' | 'pending' | 'paused';

function AdminStoresPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user: adminUser } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StoreFilter>('all');

  // Estados para el Modal
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);

  // 1. Cargar Tiendas.
  // OJO escala: a diferencia de `orders`/`users`/`withdrawals`, `stores` es una colección
  // ACOTADA por diseño (marketplace de pueblo) y ya se baja entera en el home del
  // comprador -- por eso acá no se pagina, es el mismo criterio documentado en la Fase Y.
  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') : null, [firestore]);
  const { data: stores, isLoading } = useCollection<any>(storesQuery);

  // 2. Filtrar (búsqueda + estado). Set chico, filtrado en memoria sin problema.
  const filteredStores = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (stores || []).filter(s => {
      if (term && !(`${s.name || ''} ${s.category || ''}`).toLowerCase().includes(term)) return false;
      if (statusFilter === 'approved' && !s.isApproved) return false;
      if (statusFilter === 'pending' && s.isApproved) return false;
      if (statusFilter === 'paused' && !s.manuallyPaused) return false;
      return true;
    });
  }, [stores, search, statusFilter]);

  const counts = useMemo(() => ({
    all: stores?.length || 0,
    approved: (stores || []).filter(s => s.isApproved).length,
    pending: (stores || []).filter(s => !s.isApproved).length,
    paused: (stores || []).filter(s => s.manuallyPaused).length,
  }), [stores]);

  const handleExportCsv = () => {
    downloadCsv(filteredStores.map((s: any) => ({
      'Tienda': s.name || '',
      'Rubro': s.category || '',
      'Dirección': s.address || '',
      'Comisión (%)': s.commissionRate ?? 0,
      'Rating': s.rating ?? '',
      'Reseñas': s.ratingCount ?? 0,
      'Estado': s.isApproved ? 'Aprobada' : 'Pendiente/Rechazada',
      'Pausada': s.manuallyPaused ? 'Sí' : 'No',
      'CBU': s.payoutCbu || '',
    })), `tiendas_${new Date().toISOString().slice(0, 10)}.csv`);
  };

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
              // Cambiar la comisión define cuánto se queda la plataforma de cada venta --
              // se audita igual que el resto de las acciones que tocan plata.
              if (adminUser) logAdminAction(firestore, adminUser.uid, 'edit_store', selectedStore.id, `${storeData.name} — comisión ${storeData.commissionRate}% · ${storeData.status}`);
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

  // 4. Manejar Borrado.
  // OJO: esto borra SOLO el documento de la tienda -- sus productos (subcolecciones
  // items/products) y sus pedidos históricos quedan en la base. Por eso el mensaje avisa
  // que conviene rechazar/pausar en vez de borrar salvo que sea un alta errónea.
  const handleDelete = async (id: string, name?: string) => {
      if (!firestore) return;
      if (!confirm(`¿Eliminar "${name || 'esta tienda'}"?\n\nSe borra el registro de la tienda, pero sus pedidos históricos quedan en la base. Si solo querés que deje de operar, mejor pausala o quitale la aprobación.`)) return;
      try {
          await deleteDoc(doc(firestore, 'stores', id));
          if (adminUser) logAdminAction(firestore, adminUser.uid, 'delete_store', id, name || '');
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
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar por nombre o rubro..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleExportCsv} disabled={filteredStores.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> CSV
                        </Button>
                        {/* Botón opcional para crear tiendas manuales */}
                        <Button onClick={() => { setSelectedStore(null); setIsDialogOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> Nueva Tienda
                        </Button>
                    </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        { k: 'all', label: 'Todas' },
                        { k: 'pending', label: 'Pendientes' },
                        { k: 'approved', label: 'Aprobadas' },
                        { k: 'paused', label: 'Pausadas' },
                    ] as { k: StoreFilter; label: string }[]).map(({ k, label }) => (
                        <button key={k} onClick={() => setStatusFilter(k)}
                            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                                statusFilter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
                            {label} ({counts[k]})
                        </button>
                    ))}
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Tienda</TableHead>
                        <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Comisión</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredStores.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                No hay tiendas con ese filtro.
                            </TableCell>
                        </TableRow>
                    )}
                    {filteredStores.map((store) => (
                        <TableRow key={store.id} className={cn(!store.isApproved && 'bg-warning/5')}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 rounded-md">
                                        <AvatarImage src={store.imageUrl} />
                                        <AvatarFallback><Store className="h-4 w-4" /></AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="truncate">{store.name}</p>
                                        {/* El rubro se había perdido de esta tabla pese a ser el
                                            filtro principal del home del comprador. */}
                                        {store.category && <p className="text-xs text-muted-foreground truncate">{store.category}</p>}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                                <div className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /> {store.address}</div>
                            </TableCell>
                            <TableCell>
                                {store.rating ? (
                                    <span className="flex items-center gap-1 text-sm">
                                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                                        {Number(store.rating).toFixed(1)}
                                        <span className="text-xs text-muted-foreground">({store.ratingCount || 0})</span>
                                    </span>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="border-info/30 text-info bg-info/10">
                                    {store.commissionRate || 0}%
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1 items-start">
                                    <Badge variant={store.isApproved ? 'default' : 'destructive'} className="text-[10px]">
                                        {store.isApproved ? 'Aprobado' : 'Pendiente/Rechazado'}
                                    </Badge>
                                    {store.manuallyPaused && (
                                        <Badge variant="outline" className="text-[10px] border-warning/40 text-warning gap-1">
                                            <Pause className="h-3 w-3" /> Pausada
                                        </Badge>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" title="Ver detalle" asChild>
                                        <Link href={`/admin/stores/${store.id}`}>
                                            <Eye className="h-4 w-4 text-muted-foreground" />
                                        </Link>
                                    </Button>
                                    <Button size="sm" variant="ghost" title="Editar" onClick={() => { setSelectedStore(store); setIsDialogOpen(true); }}>
                                        <Edit className="h-4 w-4 text-info" />
                                    </Button>
                                    <Button size="sm" variant="ghost" title="Eliminar" onClick={() => handleDelete(store.id, store.name)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
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

export default function AdminStoresPageGuarded() {
  return <AdminAuthGuard><AdminStoresPage /></AdminAuthGuard>;
}