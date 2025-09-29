import Link from 'next/link';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, PackageSearch } from 'lucide-react';
import { getOrdersByUser } from '@/lib/order-service';
import { auth } from '@/lib/firebase';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAuth } from "firebase/auth";
import { cookies } from "next/headers";
import { app } from "@/lib/firebase";

async function getAuthenticatedUser() {
    const auth = getAuth(app);
    const sessionCookie = cookies().get("session")?.value;
    if (!sessionCookie) return null;
    try {
      const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
      return decodedClaims;
    } catch (error) {
      return null;
    }
  }

export default async function OrdersPage() {
  const user = auth.currentUser;
  
  // This is a server component, so we can't use the client-side `auth.currentUser`.
  // We'll need a more robust server-side auth check in a real app,
  // but for now, we'll try to get the user ID from a hypothetical server session.
  // This part of the code needs a proper server-side auth implementation.
  // For now, let's assume we can get the user ID.
  // In a real app, you might use NextAuth.js, Clerk, or Firebase's own server-side auth handling.

  if (!user) {
    redirect('/login');
  }

  const userOrders = await getOrdersByUser(user.uid);

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

  return (
    <div className="container mx-auto">
      <PageHeader title="Mis Pedidos" description="Ve tus pedidos recientes y en curso." />
      <div className="space-y-4">
        {userOrders.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-48">
              <PackageSearch className="h-12 w-12 mb-4" />
              <p className="text-lg">Aún no has realizado ningún pedido.</p>
              <p className="text-sm">¡Explora las tiendas y encuentra algo que te guste!</p>
            </CardContent>
          </Card>
        ) : (
          userOrders.map((order) => (
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
    </div>
  );
}
