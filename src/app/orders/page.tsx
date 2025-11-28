'use client';

import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import BuyerOrdersView from './buyer-orders-view';
import StoreOrdersView from './store-orders-view';
import DeliveryOrdersView from './delivery-orders-view';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect } from 'react';

export default function OrdersPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  if (authLoading || !user || !userProfile) {
    return (
      <div className="container mx-auto">
        <PageHeader title="Cargando Pedidos..." description="Por favor, espera un momento." />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (userProfile.role) {
      case 'store':
        return <StoreOrdersView />;
      case 'delivery':
        return <DeliveryOrdersView />;
      case 'buyer':
        return <BuyerOrdersView />;
      default:
        return <BuyerOrdersView />;
    }
  };

  const getPageInfo = () => {
    switch (userProfile.role) {
      case 'store':
        return { title: "Gestión de Pedidos", description: "Gestiona los pedidos de tu tienda." };
      case 'delivery':
        return { title: "Panel de Repartidor", description: "Gestiona los pedidos disponibles y tus entregas activas." };
      case 'buyer':
        return { title: "Mis Pedidos", description: "Ve tus pedidos recientes y en curso." };
      default:
        return { title: "Mis Pedidos", description: "Ve tus pedidos recientes y en curso." };
    }
  }

  const { title, description } = getPageInfo();

  return (
    <div className="container mx-auto">
      <PageHeader title={title} description={description} />
      {renderView()}
    </div>
  );
}