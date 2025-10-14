
'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { getDeliveryPersonnel, updateDeliveryPersonnelStatus } from '@/lib/data-service';
import { DeliveryPersonnelList } from './delivery-personnel-list';
import { useAuth } from '@/context/auth-context';
import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePrototypeData } from '@/context/prototype-data-context';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { ManageDriverDialog } from './manage-driver-dialog';
import AdminAuthGuard from '../admin-auth-guard';


function AdminDeliveryPage() {
  const { user, loading: authLoading } = useAuth();
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { prototypeDelivery, updatePrototypeDelivery, loading: prototypeLoading, addPrototypeDelivery, deletePrototypeDelivery } = usePrototypeData();
  const isPrototypeAdmin = user?.uid.startsWith('proto-');
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryPersonnel | null>(null);


  const fetchPersonnel = async () => {
    setLoading(true);
    const fetchedPersonnel = await getDeliveryPersonnel(isPrototypeAdmin);
    
    if (isPrototypeAdmin) {
      const protoDeliveryExists = fetchedPersonnel.some(p => p.id === prototypeDelivery.id);
      if (!protoDeliveryExists) {
        setPersonnel([prototypeDelivery, ...fetchedPersonnel]);
      } else {
        setPersonnel(fetchedPersonnel.map(p => p.id === prototypeDelivery.id ? prototypeDelivery : p));
      }
    } else {
      setPersonnel(fetchedPersonnel);
    }
    setLoading(false);
  };
  
  useEffect(() => {
    if (!authLoading && !prototypeLoading) {
      fetchPersonnel();
    }
  }, [user, authLoading, prototypeLoading, prototypeDelivery]);


  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    try {
        const newStatus = status === 'approved' ? 'Activo' : 'Rechazado';
        updatePrototypeDelivery({ id: personnelId, status: newStatus });
        
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

  const handleSaveDriver = (driverData: DeliveryPersonnel) => {
    addPrototypeDelivery(driverData);
    toast({
      title: editingDriver ? 'Repartidor Actualizado' : 'Repartidor Añadido',
      description: `Los datos de ${driverData.name} han sido guardados.`,
    });
    setManageDialogOpen(false);
  };

  const handleDeleteDriver = (driverId: string) => {
    deletePrototypeDelivery(driverId);
    toast({
      title: 'Repartidor Eliminado',
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
      {loading || authLoading || prototypeLoading ? (
         <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <DeliveryPersonnelList
          personnel={personnel}
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
