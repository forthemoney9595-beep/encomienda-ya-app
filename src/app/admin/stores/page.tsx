'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { useAuth } from '@/context/auth-context';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { StoresList } from './stores-list';
import { ManageStoreDialog } from './manage-store-dialog';
import AdminAuthGuard from '../admin-auth-guard';

function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { prototypeStores, updatePrototypeStore, loading: prototypeLoading, deletePrototypeStore } = usePrototypeData();
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  useEffect(() => {
    if (!authLoading && !prototypeLoading) {
      setStores(prototypeStores);
      setLoading(false);
    }
  }, [user, authLoading, prototypeLoading, prototypeStores]);

  const handleStatusUpdate = (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    const storeToUpdate = stores.find(s => s.id === storeId);
    if (!storeToUpdate) return;
    
    updatePrototypeStore({ ...storeToUpdate, id: storeId, status });
    
    toast({
        title: '¡Éxito!',
        description: `La tienda ha sido ${status === 'Aprobado' ? 'aprobada' : 'rechazada'}.`,
    });
  };

  const handleSaveChanges = (storeData: Store) => {
    updatePrototypeStore(storeData);
    toast({
      title: 'Tienda Actualizada',
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
  
  const openDialogForEdit = (store: Store) => {
    setEditingStore(store);
    setManageDialogOpen(true);
  };

  return (
    <div className="container mx-auto">
      <ManageStoreDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveChanges}
        store={editingStore}
      />
      <PageHeader title="Gestión de Tiendas" description="Administra las tiendas registradas en la plataforma." />
      
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

export default function GuardedAdminStoresPage() {
    return (
        <AdminAuthGuard>
            <AdminStoresPage />
        </AdminAuthGuard>
    )
}
