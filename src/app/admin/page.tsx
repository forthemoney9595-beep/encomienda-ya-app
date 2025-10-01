'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Truck, ClipboardList } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getStores, getDeliveryPersonnel } from '@/lib/data-service';
import { usePrototypeData } from '@/context/prototype-data-context';
import type { Store as StoreType, DeliveryPersonnel } from '@/lib/placeholder-data';


export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [totalStores, setTotalStores] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const { prototypeOrders, getAvailableOrdersForDelivery, loading: prototypeLoading } = usePrototypeData();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push('/login');
    }
    if (isAdmin) {
      const fetchData = async () => {
        setDashboardLoading(true);
        const isPrototype = user?.uid.startsWith('proto-') ?? false;
        
        let stores: StoreType[] = [];
        let drivers: DeliveryPersonnel[] = [];
        let availableOrderCount = 0;

        if (isPrototype) {
            // For prototype admin, use prototype data directly
            stores = await getStores(true, true); // this already includes the proto-store
            drivers = await getDeliveryPersonnel(true); // this includes proto-delivery
            availableOrderCount = getAvailableOrdersForDelivery().length;
        } else {
            const [fetchedStores, fetchedDrivers, fetchedAvailableOrders] = await Promise.all([
              getStores(true, false),
              getDeliveryPersonnel(false),
              getAvailableOrdersForDelivery(), // This uses the prototype context method
            ]);
            stores = fetchedStores;
            drivers = fetchedDrivers;
            availableOrderCount = fetchedAvailableOrders.length;
        }

        setTotalStores(stores.length);
        setTotalDrivers(drivers.length);
        setPendingOrders(availableOrderCount);
        setDashboardLoading(false);
      }
      fetchData();
    }
  }, [user, isAdmin, loading, router, prototypeOrders, prototypeLoading, getAvailableOrdersForDelivery]);
  
  if (loading || dashboardLoading || !isAdmin) {
    return (
       <div className="container mx-auto">
        <PageHeader title="Panel de Administración" description="Resumen y estadísticas de la plataforma." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tiendas Totales</CardTitle>
              <Store className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="h-4 w-1/2 mt-1" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conductores Totales</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="h-4 w-1/2 mt-1" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos Pendientes</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="h-4 w-1/2 mt-1" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="Panel de Administración" description="Resumen y estadísticas de la plataforma." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tiendas Totales</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStores}</div>
            <p className="text-xs text-muted-foreground">tiendas gestionadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conductores Totales</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDrivers}</div>
            <p className="text-xs text-muted-foreground">personal de reparto</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Pendientes</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders}</div>
            <p className="text-xs text-muted-foreground">pedidos por completar</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
