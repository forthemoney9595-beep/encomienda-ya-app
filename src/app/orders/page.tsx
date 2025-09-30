
'use client';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import BuyerOrdersView from './buyer-orders-view';
import StoreOrdersView from './store-orders-view';
import DeliveryOrdersView from './delivery-orders-view';
import { Skeleton } from '@/components/ui/skeleton';

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  if (authLoading) {
    return (
      <div className="container mx-auto">
        <PageHeader title="Cargando Pedidos..." description="Por favor, espera un momento." />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    // This check needs to run on the client side after loading is complete
    if (typeof window !== 'undefined') {
      router.push('/login');
    }
    return null; // Render nothing while redirecting
  }

  const renderView = () => {
    switch (user.role) {
      case 'store':
        return <StoreOrdersView />;
      case 'delivery':
        // For delivery, we might need a more complex data fetching strategy
        // Let's assume for now it's handled inside the component.
        return <DeliveryOrdersView />;
      default: // 'buyer'
        return <BuyerOrdersView />;
    }
  };

  const getPageInfo = () => {
    switch (user.role) {
      case 'store':
        return { title: "Gestión de Pedidos", description: "Gestiona los pedidos de tu tienda." };
      case 'delivery':
        return { title: "Panel de Repartidor", description: "Gestiona los pedidos disponibles y tus entregas activas." };
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
