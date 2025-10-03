
'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { getDeliveryPersonnel, updateDeliveryPersonnelStatus } from '@/lib/data-service';
import { DeliveryPersonnelList } from './delivery-personnel-list';
import { useAuth, useFirestore } from '@/firebase';
import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePrototypeData } from '@/context/prototype-data-context';
import { prototypeUsers } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';


export default function AdminDeliveryPage() {
  const { user, loading: authLoading } = useAuth();
  const db = useFirestore();
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { prototypeDelivery, updatePrototypeDelivery, loading: prototypeLoading } = usePrototypeData();
  const isPrototypeAdmin = user?.uid.startsWith('proto-');

  const fetchPersonnel = async () => {
    if (!db) return;
    setLoading(true);
    const fetchedPersonnel = await getDeliveryPersonnel(db, false);
    
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
    if (!authLoading && db) {
      fetchPersonnel();
    }
  }, [user, authLoading, prototypeDelivery, db]);


  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    if (!db) return;
    try {
        if (personnelId === prototypeDelivery.id) {
            const newStatus = status === 'approved' ? 'Activo' : 'Rechazado';
            updatePrototypeDelivery({ status: newStatus });
        } else {
            await updateDeliveryPersonnelStatus(db, personnelId, status);
            await fetchPersonnel(); // Refetch for real users
        }
        
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
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto.">
         <Button onClick={() => alert('Próximamente: Añadir nuevo conductor')}>
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
        <DeliveryPersonnelList personnel={personnel} onStatusUpdate={handleStatusUpdate} />
      )}
    </div>
  );
}
