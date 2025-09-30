
'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/page-header';
import { getOrdersByUser, getOrdersByStore, getAvailableOrdersForDelivery, getOrdersByDeliveryPerson, type Order } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import BuyerOrdersView from './buyer-orders-view';
import StoreOrdersView from './store-orders-view';
import DeliveryOrdersView from './delivery-orders-view';
import { Skeleton } from '@/components/ui/skeleton';
import { getPrototypeOrdersByStore } from '@/lib/placeholder-data';

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [pageProps, setPageProps] = useState<any>({});
  const [pageInfo, setPageInfo] = useState({ title: '', description: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const userRole = user.role;
      let props: any = {};
      let title = "";
      let description = "";

      try {
        if (user.uid.startsWith('proto-')) {
            // Handle prototype users client-side
             switch (userRole) {
              case 'store':
                const protoOrders = getPrototypeOrdersByStore(user.storeId!);
                title = "Gestión de Pedidos (Prototipo)";
                description = "Gestiona los pedidos de tu tienda.";
                props = { orders: protoOrders };
                break;
              case 'buyer':
                 const buyerOrders = await getOrdersByUser(user.uid);
                 title = "Mis Pedidos";
                 description = "Ve tus pedidos recientes y en curso.";
                 props = { orders: buyerOrders };
                 break;
              default:
                 // Fallback for other prototype roles if needed
                 title = "Panel de Pedidos";
                 description = "Gestiona tus pedidos.";
                 props = { orders: [] };
                 break;
            }
        } else {
            // Handle real users
            switch (userRole) {
              case 'store':
                const orders = user.storeId ? await getOrdersByStore(user.storeId) : [];
                title = "Gestión de Pedidos";
                description = "Gestiona los pedidos de tu tienda.";
                props = { orders };
                break;
              case 'delivery':
                const [availableOrders, assignedOrders] = await Promise.all([
                  getAvailableOrdersForDelivery(),
                  getOrdersByDeliveryPerson(user.uid),
                ]);
                title = "Panel de Repartidor";
                description = "Gestiona los pedidos disponibles y tus entregas activas.";
                props = { availableOrders, assignedOrders };
                break;
              default: // 'buyer' and any other case
                const buyerOrders = await getOrdersByUser(user.uid);
                title = "Mis Pedidos";
                description = "Ve tus pedidos recientes y en curso.";
                props = { orders: buyerOrders };
                break;
            }
        }
        setPageProps(props);
        setPageInfo({ title, description });
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router]);

  const renderView = () => {
    if (!user) return null;
    switch (user.role) {
      case 'store':
        return <StoreOrdersView {...pageProps} />;
      case 'delivery':
        return <DeliveryOrdersView {...pageProps} />;
      default:
        return <BuyerOrdersView {...pageProps} />;
    }
  };

  if (authLoading || loading) {
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

  return (
    <div className="container mx-auto">
      <PageHeader title={pageInfo.title} description={pageInfo.description} />
      {renderView()}
    </div>
  );
}
