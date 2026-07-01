'use client';

import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, CollectionReference } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { FinanceView } from '../dashboard/finance-view';

function AdminFinancesPage() {
  const firestore = useFirestore();

  const ordersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'orders') as CollectionReference<Order> : null, [firestore]);
  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') : null, [firestore]);
  const usersQuery  = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);

  const { data: orders } = useCollection<Order>(ordersQuery);
  const { data: stores } = useCollection<any>(storesQuery);
  const { data: users }  = useCollection<any>(usersQuery);

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader title="Finanzas y Pagos" description="Solicitudes de retiro de tiendas y repartidores." />
      <FinanceView orders={(orders as any[]) || []} stores={stores || []} users={users || []} />
    </div>
  );
}

export default function AdminFinancesPageGuarded() {
  return <AdminAuthGuard><AdminFinancesPage /></AdminAuthGuard>;
}
