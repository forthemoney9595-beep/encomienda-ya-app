import Link from 'next/link';
import PageHeader from '@/components/page-header';
import { getOrdersByUser, getOrdersByStore, getAvailableOrdersForDelivery } from '@/lib/order-service';
import { db } from "@/lib/firebase";
import { cookies } from "next/headers";
import { redirect } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import BuyerOrdersView from './buyer-orders-view';
import StoreOrdersView from './store-orders-view';
import DeliveryOrdersView from './delivery-orders-view';


async function getAuthenticatedUser() {
  // This is a simplified server-side auth check. 
  // In a production app, this would be more robust.
  const sessionCookie = cookies().get("session")?.value;
  if (!sessionCookie) return null;
  
  try {
    // This is a placeholder for a real verification logic
    // For this prototype, we assume the cookie is a UID.
    // WARNING: Do not do this in production.
    const userDoc = await getDoc(doc(db, "users", sessionCookie));
    if (userDoc.exists()) {
        return { uid: userDoc.id, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error("Auth check failed:", error);
    return null;
  }
}

export default async function OrdersPage() {
  const user = await getAuthenticatedUser();
  
  if (!user) {
    redirect('/login');
  }

  const userRole = user.role;
  let orders = [];
  let pageTitle = "";
  let pageDescription = "";

  switch (userRole) {
    case 'store':
      orders = user.storeId ? await getOrdersByStore(user.storeId) : [];
      pageTitle = "Gestión de Pedidos";
      pageDescription = "Gestiona los pedidos de tu tienda.";
      break;
    case 'delivery':
      orders = await getAvailableOrdersForDelivery();
      pageTitle = "Pedidos Disponibles";
      pageDescription = "Acepta pedidos para empezar a entregar.";
      break;
    default: // 'buyer' and any other case
      orders = await getOrdersByUser(user.uid);
      pageTitle = "Mis Pedidos";
      pageDescription = "Ve tus pedidos recientes y en curso.";
      break;
  }
  
  const renderView = () => {
    switch (userRole) {
      case 'store':
        return <StoreOrdersView orders={orders} />;
      case 'delivery':
        return <DeliveryOrdersView orders={orders} />;
      default:
        return <BuyerOrdersView orders={orders} />;
    }
  }


  return (
    <div className="container mx-auto">
      <PageHeader title={pageTitle} description={pageDescription} />
      {renderView()}
    </div>
  );
}
