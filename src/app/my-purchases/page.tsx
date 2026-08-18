'use client';

import BuyerOrdersView from '@/app/orders/buyer-orders-view';

// "Mis Compras" para cuentas de TIENDA y REPARTIDOR (ago 2026): pueden comprar como
// cualquier vecino, pero /orders les muestra su panel OPERATIVO (gestión de pedidos /
// panel de entregas) — sus compras quedaban invisibles. Esta página reusa la MISMA vista
// del comprador (cero duplicación: la consulta ya filtra por userId del logueado, es
// independiente del rol). Los compradores siguen usando /orders como siempre.
export default function MyPurchasesPage() {
  return (
    <div className="container mx-auto max-w-3xl py-6 px-4">
      <h1 className="text-2xl font-bold mb-1">Mis Compras</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Lo que pediste como cliente, aparte de tu panel de trabajo.
      </p>
      <BuyerOrdersView />
    </div>
  );
}
