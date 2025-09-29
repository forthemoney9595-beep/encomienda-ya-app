import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Store, PackageSearch } from 'lucide-react';
import type { Order } from '@/lib/order-service';

export default function DeliveryOrdersView({ orders }: { orders: Order[] }) {
  return (
    <div className="space-y-4">
      {orders.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center justify-center h-48">
            <PackageSearch className="h-12 w-12 mb-4" />
            <p className="text-lg">No hay pedidos disponibles para entrega en este momento.</p>
            <p className="text-sm">Vuelve a consultar pronto.</p>
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => (
          <Card key={order.id} className="transition-all hover:bg-muted/50">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> {order.storeName}</CardTitle>
                  <CardDescription>Pedido #{order.id.substring(0, 7)}</CardDescription>
                </div>
                <p className="text-2xl font-bold text-primary">${order.total.toFixed(2)}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                        <div>
                            <span className="font-semibold">Recoger en:</span>
                            <p className="text-muted-foreground">{order.storeAddress}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                        <div>
                            <span className="font-semibold">Entregar a:</span>
                             <p className="text-muted-foreground">{order.shippingAddress.name}, {order.shippingAddress.address}</p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" asChild>
                        <Link href={`/orders/${order.id}`}>Ver Detalles</Link>
                    </Button>
                    <Button>Aceptar Pedido</Button>
                </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
