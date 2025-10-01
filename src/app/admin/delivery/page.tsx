
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

export default function AdminDeliveryPage() {
  const { user, loading: authLoading } = useAuth();
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { updatePrototypeDelivery, loading: prototypeLoading } = usePrototypeData();
  const isPrototype = user?.uid.startsWith('proto-') ?? false;

  const fetchPersonnel = async () => {
    setLoading(true);
    const fetchedPersonnel = await getDeliveryPersonnel(isPrototype);
    setPersonnel(fetchedPersonnel);
    setLoading(false);
  };
  
  useEffect(() => {
    if (!authLoading && !prototypeLoading) {
      fetchPersonnel();
    }
  }, [user, authLoading, prototypeLoading]);


  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    try {
        if (personnelId.startsWith('proto-')) {
            const newStatus = status === 'approved' ? 'Activo' : 'Rechazado';
            updatePrototypeDelivery({ status: newStatus });
        } else {
            await updateDeliveryPersonnelStatus(personnelId, status);
        }

        await fetchPersonnel();
        
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

  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto." />
      {loading || authLoading || prototypeLoading ? (
         <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <DeliveryPersonnelList personnel={personnel} onStatusUpdate={handleStatusUpdate} />
      )}
    </div>
  );
}
