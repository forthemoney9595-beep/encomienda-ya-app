'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Loader2 } from 'lucide-react';

import BuyerOrdersView from './buyer-orders-view';
import StoreOrdersView from './store-orders-view';
import DeliveryOrdersView from './delivery-orders-view';

export default function OrdersPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center" role="status">
        <span className="glass flex h-16 w-16 items-center justify-center rounded-card">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </span>
        <span className="sr-only">Cargando tus pedidos…</span>
      </div>
    );
  }

  if (!user || !userProfile) return null;

  // 🚦 SEMÁFORO DE VISTAS INTELIGENTE
  switch (userProfile.role) {
    case 'store':
      // Si eres tienda, vas a tu panel de pedidos entrantes
      return <StoreOrdersView />;
      
    case 'delivery':
      // Si eres repartidor, te mostramos tu historial o el dashboard
      return <DeliveryOrdersView />; 
      
    case 'buyer':
    default:
      // Si eres cliente, vas a "Mis Pedidos"
      return <BuyerOrdersView />;
  }
}