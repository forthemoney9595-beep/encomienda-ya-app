'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { getDeliveryPersonnel } from '@/lib/data-service';
import { DeliveryPersonnelList } from './delivery-personnel-list';
import { useAuth } from '@/context/auth-context';
import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminDeliveryPage() {
  const { user, loading: authLoading } = useAuth();
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const fetchPersonnel = async () => {
      setLoading(true);
      const isPrototype = user?.uid.startsWith('proto-') ?? false;
      const fetchedPersonnel = await getDeliveryPersonnel(isPrototype);
      setPersonnel(fetchedPersonnel);
      setLoading(false);
    };

    fetchPersonnel();
  }, [user, authLoading]);

  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto." />
      {loading ? (
         <div className="border rounded-lg p-4">
            <Skeleton className="h-8 w-1/4 mb-4" />
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <DeliveryPersonnelList personnel={personnel} />
      )}
    </div>
  );
}
