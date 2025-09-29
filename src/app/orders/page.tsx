import Link from 'next/link';
import PageHeader from '@/components/page-header';
import { getOrdersByUser, getOrdersByStore } from '@/lib/order-service';
import { db } from "@/lib/firebase";
import { cookies } from "next/headers";
import { redirect } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import BuyerOrdersView from './buyer-orders-view';
import StoreOrdersView from './store-orders-view';


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

  const isStoreOwner = user.role === 'store';
  const orders = isStoreOwner && user.storeId
    ? await getOrdersByStore(user.storeId)
    : await getOrdersByUser(user.uid);

  const pageTitle = isStoreOwner ? "Gestión de Pedidos" : "Mis Pedidos";
  const pageDescription = isStoreOwner ? "Gestiona los pedidos de tu tienda." : "Ve tus pedidos recientes y en curso.";

  return (
    <div className="container mx-auto">
      <PageHeader title={pageTitle} description={pageDescription} />
      {isStoreOwner ? <StoreOrdersView orders={orders} /> : <BuyerOrdersView orders={orders} />}
    </div>
  );
}
