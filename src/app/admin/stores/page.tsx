
'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { getStores, updateStoreStatus } from '@/lib/data-service';
import { StoresList } from './stores-list';
import { useAuth } from '@/context/auth-context';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useToast } from '@/hooks/use-toast';
import { prototypeUsers } from '@/lib/placeholder-data';

export default function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { prototypeStore, updatePrototypeStore, loading: prototypeLoading } = usePrototypeData();
  const { toast } = useToast();
  const isPrototypeAdmin = user?.uid === prototypeUsers['admin@test.com'].uid;

  const fetchStores = async () => {
    setLoading(true);
    // In prototype mode, we fetch real stores and then merge our prototype store
    const fetchedStores = await getStores(true, false); 
    
    if (isPrototypeAdmin) {
       const protoStoreExists = fetchedStores.some(s => s.id === prototypeStore.id);
       if (!protoStoreExists) {
         setStores([prototypeStore, ...fetchedStores]);
       } else {
         setStores(fetchedStores.map(s => s.id === prototypeStore.id ? prototypeStore : s));
       }
    } else {
        setStores(fetchedStores);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading) {
      fetchStores();
    }
  }, [user, authLoading, prototypeStore]); // Depend on prototypeStore to re-fetch when it changes

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    try {
      if (storeId === prototypeStore.id) {
        updatePrototypeStore({ status });
      } else {
        // This would be for real stores in a mixed environment
        await updateStoreStatus(storeId, status);
        // We need to refetch for real stores too
        await fetchStores(); 
      }
      
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

  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Tiendas" description="Agrega, edita o elimina cuentas de tiendas.">
        <Button onClick={() => alert('Próximamente: Añadir nueva tienda')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Nueva Tienda
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
        <StoresList stores={stores} onStatusUpdate={handleStatusUpdate} />
      )}
    </div>
  );
}
