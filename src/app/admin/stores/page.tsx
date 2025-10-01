
'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { getStores } from '@/lib/data-service';
import { StoresList } from './stores-list';
import { useAuth } from '@/context/auth-context';
import type { Store } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrototypeData } from '@/context/prototype-data-context';

export default function AdminStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { prototypeStore, updatePrototypeStore } = usePrototypeData();
  const isPrototype = user?.uid.startsWith('proto-') ?? false;

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      if (isPrototype) {
        // In prototype mode, we might want to manage a list of stores in context
        // For now, we just use the single prototype store
        setStores([prototypeStore]);
      } else {
        const fetchedStores = await getStores(true, false);
        setStores(fetchedStores);
      }
      setLoading(false);
    };

    if (!authLoading) {
      fetchStores();
    }
  }, [user, authLoading, isPrototype, prototypeStore]);

  const handleStatusUpdate = async (storeId: string, status: 'Aprobado' | 'Rechazado') => {
      if (isPrototype && storeId === prototypeStore.id) {
          updatePrototypeStore({ status });
          setStores([ { ...prototypeStore, status } ]); // Force re-render with new status
      } else {
          // This would be a call to a server action for real stores
          console.log("Real store status update not implemented for admin prototype page yet.");
      }
  }

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
