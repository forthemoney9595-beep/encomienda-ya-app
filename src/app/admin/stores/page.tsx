'use client';

import { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { useAuth, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { StoresList } from './stores-list';
import { ManageStoreDialog } from './manage-store-dialog';
import AdminAuthGuard from '../admin-auth-guard';
import { collection, CollectionReference, doc, updateDoc } from 'firebase/firestore';
import { updateStoreStatus } from '@/lib/data-service';

function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') as CollectionReference<Store> : null, [firestore]);
  const { data: stores, isLoading: storesLoading } = useCollection<Store>(storesQuery);
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    if (!firestore) return;
    
    try {
        await updateStoreStatus(firestore, storeId, status);
        toast({
            title: '¡Éxito!',
            description: `La tienda ha sido ${status === 'Aprobado' ? 'aprobada' : 'rechazada'}.`,
        });
    } catch (error) {
        console.error("Error updating store status: ", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo actualizar el estado de la tienda.',
        });
    }
  };

  const handleSaveChanges = async (storeData: Store) => {
    if (!firestore) return;
    try {
        const storeRef = doc(firestore, 'stores', storeData.id);
        await updateDoc(storeRef, {
            name: storeData.name,
            address: storeData.address,
            status: storeData.status,
        });
        toast({
        title: 'Tienda Actualizada',
        description: `Los datos de ${storeData.name} han sido guardados.`,
        });
        setManageDialogOpen(false);
    } catch (error) {
         console.error("Error saving store changes: ", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudieron guardar los cambios de la tienda.',
        });
    }
  };

  const handleDeleteStore = (storeId: string) => {
    // Implement delete logic if needed
    console.log("Deleting store:", storeId);
    toast({
      title: 'Función no implementada',
      description: 'La eliminación de tiendas aún no está conectada.',
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
      
      {authLoading || storesLoading ? (
         <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <StoresList
          stores={stores || []}
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
