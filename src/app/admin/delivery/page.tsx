'use client';

import { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { updateDeliveryPersonnelStatus } from '@/lib/data-service';
import { DeliveryPersonnelList } from './delivery-personnel-list';
import { useAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { DeliveryPersonnel, UserProfile } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { ManageDriverDialog } from './manage-driver-dialog';
import AdminAuthGuard from '../admin-auth-guard';
import { collection, CollectionReference, query, where, doc, updateDoc, setDoc } from 'firebase/firestore';
import { createUserProfile, updateUserProfile } from '@/lib/user-service';

function AdminDeliveryPage() {
  const { user, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryPersonnel | null>(null);

  const personnelQuery = useMemoFirebase(() => 
    firestore ? query(collection(firestore, 'users'), where('role', '==', 'delivery')) as CollectionReference<DeliveryPersonnel> : null, 
    [firestore]
  );
  const { data: personnel, isLoading: personnelLoading } = useCollection<DeliveryPersonnel>(personnelQuery);

  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    if (!firestore) return;

    try {
        const newStatus = status === 'approved' ? 'Activo' : 'Rechazado';
        await updateDeliveryPersonnelStatus(firestore, personnelId, newStatus);
        
        toast({
            title: '¡Éxito!',
            description: `El repartidor ha sido ${status === 'approved' ? 'aprobado' : 'rechazado'}.`,
        });

    } catch (error) {
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo actualizar el estado del repartidor.',
        });
    }
  };

  const handleSaveDriver = async (driverData: DeliveryPersonnel) => {
    if(!firestore) return;
    
    const isEditing = !!editingDriver;

    try {
      if (isEditing) {
        updateUserProfile(firestore, driverData.id, driverData as Partial<UserProfile>);
      } else {
        // This is a simplified creation flow for admins. In a real app, you'd create a Firebase Auth user first.
        // For this prototype, we're just creating the Firestore user document.
        const newDriverId = driverData.id || `driver-${Date.now()}`;
        const profileToCreate: UserProfile = {
            ...driverData,
            uid: newDriverId,
            role: 'delivery',
        }
        await setDoc(doc(firestore, "users", newDriverId), profileToCreate);
      }
       
      toast({
        title: editingDriver ? 'Repartidor Actualizado' : 'Repartidor Añadido',
        description: `Los datos de ${driverData.name} han sido guardados.`,
      });

    } catch(error) {
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo guardar el repartidor.',
        });
    } finally {
       setManageDialogOpen(false);
    }
  };

  const handleDeleteDriver = (driverId: string) => {
    toast({
      title: 'Repartidor Eliminado',
      description: `Función no implementada para eliminar ${driverId}`,
      variant: 'destructive',
    });
  };

  const openDialogForCreate = () => {
    setEditingDriver(null);
    setManageDialogOpen(true);
  };

  const openDialogForEdit = (driver: DeliveryPersonnel) => {
    setEditingDriver(driver);
    setManageDialogOpen(true);
  };

  return (
    <div className="container mx-auto">
      <ManageDriverDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveDriver}
        driver={editingDriver}
      />
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto.">
         <Button onClick={openDialogForCreate}>
           <PlusCircle className="mr-2 h-4 w-4" />
           Agregar Nuevo Conductor
         </Button>
      </PageHeader>
      {authLoading || personnelLoading ? (
         <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <DeliveryPersonnelList
          personnel={personnel || []}
          onStatusUpdate={handleStatusUpdate}
          onEdit={openDialogForEdit}
          onDelete={handleDeleteDriver}
        />
      )}
    </div>
  );
}


export default function GuardedAdminDeliveryPage() {
    return (
        <AdminAuthGuard>
            <AdminDeliveryPage />
        </AdminAuthGuard>
    )
}
