
'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { StoresList } from './stores-list';
import { useAuth } from '@/context/auth-context';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useToast } from '@/hooks/use-toast';
import { ManageStoreDialog } from './manage-store-dialog';

export default function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const { prototypeStores, updatePrototypeStore, loading: prototypeLoading, addPrototypeStore, deletePrototypeStore } = usePrototypeData();
  const { toast } = useToast();

  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    try {
      updatePrototypeStore({ id: storeId, status });
      
      toast({
        title: '¡Éxito!',
        description: `La tienda ha sido marcada como ${status.toLowerCase()}.`,
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
      description: `La tienda ${storeData.name} ha sido guardada.`,
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
      <PageHeader title="Gestión de Tiendas" description="Agrega, edita o elimina cuentas de tiendas.">
        <Button onClick={openDialogForCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Nueva Tienda
        </Button>
      </PageHeader>
      {prototypeLoading || authLoading ? (
        <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <StoresList 
          stores={prototypeStores} 
          onStatusUpdate={handleStatusUpdate}
          onEdit={openDialogForEdit}
          onDelete={handleDeleteStore}
        />
      )}
    </div>
  );
}
