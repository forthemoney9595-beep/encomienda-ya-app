'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { getStores as fetchStores, updateStoreStatus } from '@/lib/data-service';
import { StoresList } from './stores-list';
import { useAuth } from '@/context/auth-context';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { ManageStoreDialog } from './manage-store-dialog';


export default function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { prototypeStores, updatePrototypeStore, loading: prototypeLoading, addPrototypeStore, deletePrototypeStore } = usePrototypeData();
  const isPrototypeAdmin = user?.uid.startsWith('proto-');

  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);


  const fetchStoresData = async () => {
    setLoading(true);
    if (isPrototypeAdmin) {
        setStores(prototypeStores);
    } else {
        const fetchedStores = await fetchStores(true); // Fetch all stores for admin
        setStores(fetchedStores);
    }
    setLoading(false);
  };
  
  useEffect(() => {
    if (!authLoading && !prototypeLoading) {
      fetchStoresData();
    }
  }, [user, authLoading, prototypeLoading, prototypeStores]);


  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    try {
        if (isPrototypeAdmin) {
            updatePrototypeStore({ id: storeId, status });
        } else {
            await updateStoreStatus(storeId, status);
            fetchStoresData(); // Re-fetch to show changes
        }
        toast({
            title: '¡Éxito!',
            description: `La tienda ha sido ${status === 'Aprobado' ? 'aprobada' : 'rechazada'}.`,
        });

    } catch (error) {
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo actualizar el estado de la tienda.',
        });
    }
  };
  
  const handleSaveStore = (storeData: Store) => {
    addPrototypeStore(storeData);
    toast({
      title: editingStore ? 'Tienda Actualizada' : 'Tienda Añadida',
      description: `Los datos de ${storeData.name} han sido guardados.`,
    });
    setManageDialogOpen(false);
  };

  const handleDeleteStore = (storeId: string) => {
    deletePrototypeStore(storeId);
    toast({
      title: 'Tienda Eliminada',
      variant: 'destructive',
    });
  };

  const openDialogForCreate = () => {
    setEditingStore(null);
    setManageDialogOpen(true);
  };

  const openDialogForEdit = (store: Store) => {
    setEditingStore(store);
    setManageDialogOpen(true);
  };

  return (
    <div className="container mx-auto">
      <ManageStoreDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveStore}
        store={editingStore}
      />
      <PageHeader title="Gestión de Tiendas" description="Administra las solicitudes de tiendas y su estado.">
        <Button onClick={openDialogForCreate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Añadir Nueva Tienda
        </Button>
      </PageHeader>
      {loading || authLoading || prototypeLoading ? (
         <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <StoresList
          stores={stores}
          onStatusUpdate={handleStatusUpdate}
          onEdit={openDialogForEdit}
          onDelete={handleDeleteStore}
        />
      )}
    </div>
  );
}