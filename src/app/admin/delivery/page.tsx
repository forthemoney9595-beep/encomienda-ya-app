'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
// ✅ Importamos la interfaz desde el archivo vecino que acabamos de arreglar
import { DeliveryPersonnelList, type DeliveryPersonnel } from './delivery-personnel-list';
// ✅ Import correcto del contexto de Auth
import { useAuth } from '@/context/auth-context'; 
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ManageDriverDialog } from './manage-driver-dialog';
import AdminAuthGuard from '../admin-auth-guard';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

function AdminDeliveryPage() {
  const { user, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryPersonnel | null>(null);

  // Consulta de Repartidores
  const personnelQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', '==', 'delivery'));
  }, [firestore]);

  const { data: personnel, isLoading: personnelLoading } = useCollection<DeliveryPersonnel>(personnelQuery);

  // Aprobar / Rechazar
  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    if (!firestore) return;

    try {
        const newStatus = status === 'approved' ? 'Activo' : 'Rechazado';
        const userRef = doc(firestore, 'users', personnelId);
        
        await updateDoc(userRef, { 
            status: newStatus,
            updatedAt: serverTimestamp() 
        });
        
        toast({
            title: 'Estado Actualizado',
            description: `El repartidor ha sido marcado como ${newStatus}.`,
            className: status === 'approved' ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"
        });

    } catch (error) {
       console.error(error);
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo actualizar el estado.',
        });
    }
  };

  // Editar (Desde el Modal de Gestión) — la creación manual de repartidores se
  // sacó porque solo creaba un perfil en Firestore sin cuenta real de Firebase Auth
  // (el repartidor nunca podría loguearse). El alta real es por autorregistro en
  // /signup/delivery; este panel solo aprueba/edita cuentas que ya existen.
  const handleSaveDriver = async (driverData: DeliveryPersonnel) => {
    if(!firestore || !editingDriver) return;

    try {
      const userRef = doc(firestore, 'users', driverData.id);
      await updateDoc(userRef, {
          ...driverData,
          updatedAt: serverTimestamp()
      });

      toast({
        title: 'Repartidor Actualizado',
        description: `Los datos de ${driverData.name} han sido guardados.`,
      });

    } catch(error) {
       console.error(error);
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo guardar el repartidor.',
        });
    } finally {
       setManageDialogOpen(false);
    }
  };

  const handleDeleteDriver = async (driverId: string) => {
    // La confirmación ya la pide el AlertDialog en personnel-actions.tsx — acá no
    // hace falta otro confirm(). Por seguridad la eliminación directa no está
    // habilitada todavía (requeriría borrar también la cuenta de Firebase Auth).
    toast({
      title: 'Acción no disponible',
      description: 'Por seguridad, la eliminación directa no está habilitada todavía.',
      variant: 'destructive',
    });
  };

  const openDialogForEdit = (driver: DeliveryPersonnel) => {
    setEditingDriver(driver);
    setManageDialogOpen(true);
  };

  return (
    <div className="container mx-auto space-y-6">
      <ManageDriverDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveDriver}
        driver={editingDriver}
      />
      
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas y aprobaciones de tu flota." />

      {authLoading || personnelLoading ? (
         <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-8 w-24" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
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