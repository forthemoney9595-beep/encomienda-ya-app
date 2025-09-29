import Link from 'next/link';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, PackageSearch, User } from 'lucide-react';
import { getOrdersByUser, getOrdersByStore } from '@/lib/order-service';
import { getAuth } from "firebase/auth";
import { app, db } from "@/lib/firebase";
import { cookies } from "next/headers";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { redirect } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

const getBadgeVariant = (status: string) => {
  switch (status) {
    case 'Entregado':
      return 'secondary';
    case 'En reparto':
      return 'default';
    case 'En preparación':
    case 'Pedido Realizado':
      return 'outline';
    case 'Cancelado':
      return 'destructive';
    default:
      return 'outline';
  }
};

function BuyerOrdersView({ orders }: { orders: any[] }) {
  return (
    <div className="space-y-4">
      {orders.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-48">
            <PackageSearch className="h-12 w-12 mb-4" />
            <p className="text-lg">Aún no has realizado ningún pedido.</p>
            <p className="text-sm">¡Explora las tiendas y encuentra algo que te guste!</p>
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => (
          <Link href={`/orders/${order.id}`} key={order.id}>
            <Card className="transition-all hover:bg-muted/50 hover:shadow-md">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0">
                  <div>
                    <CardTitle className="text-lg">{order.storeName}</CardTitle>
                    <CardDescription>Pedido #{order.id.substring(0, 7)}</CardDescription>
                  </div>
                  <Badge variant={getBadgeVariant(order.status)} className="w-fit">{order.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{format(order.createdAt, "d 'de' MMMM, yyyy", { locale: es })}</p>
                  <p className="text-2xl font-bold text-primary">${order.total.toFixed(2)}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}

function StoreOrdersView({ orders }: { orders: any[] }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pedidos Entrantes</CardTitle>
          <CardDescription>Aquí están los pedidos que tu tienda ha recibido.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Aún no has recibido ningún pedido.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => window.location.href=`/orders/${order.id}`}>
                    <TableCell className="font-medium">#{order.id.substring(0, 7)}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{format(order.createdAt, "Pp", { locale: es })}</TableCell>
                    <TableCell>
                      <Badge variant={getBadgeVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">${order.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
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
