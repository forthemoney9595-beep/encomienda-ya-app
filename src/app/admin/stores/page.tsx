
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

export default function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { updatePrototypeStore, loading: prototypeLoading } = usePrototypeData();
  const { toast } = useToast();
  const isPrototype = user?.uid.startsWith('proto-') ?? false;

  const fetchStores = async () => {
    setLoading(true);
    const fetchedStores = await getStores(true, isPrototype);
    setStores(fetchedStores);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !prototypeLoading) {
      fetchStores();
    }
  }, [user, authLoading, prototypeLoading]);

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
    try {
      if (storeId.startsWith('proto-')) {
        updatePrototypeStore({ status });
      } else {
        await updateStoreStatus(storeId, status);
      }
      
      // Refresca la lista para mostrar el cambio
      await fetchStores();

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
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Nueva Tienda
        </Button>
      </PageHeader>
      {loading ? (
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
