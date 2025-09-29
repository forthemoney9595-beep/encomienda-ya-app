'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Truck, ClipboardList } from 'lucide-react';
import { deliveryPersonnel, orders } from '@/lib/placeholder-data';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getStores } from '@/lib/data-service';
import type { Store as StoreType } from '@/lib/placeholder-data';


export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [totalStores, setTotalStores] = useState(0);

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push('/login');
    }
    if (isAdmin) {
      getStores().then(stores => setTotalStores(stores.length));
    }
  }, [user, isAdmin, loading, router]);


  const totalDrivers = deliveryPersonnel.length;
  const pendingOrders = orders.filter(o => o.status !== 'Entregado').length;
  
  if (loading || !isAdmin) {
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
