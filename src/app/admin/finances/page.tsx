'use client';

import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { FinanceView } from '../dashboard/finance-view';

function AdminFinancesPage() {
  // FinanceView trae sus propios `withdrawals` (colección chica). Antes esta página bajaba
  // orders/stores/users ENTERAS para pasárselas, pero FinanceView no las usaba (props muertos).
  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader title="Finanzas y Pagos" description="Solicitudes de retiro de tiendas y repartidores." />
      <FinanceView />
    </div>
  );
}

export default function AdminFinancesPageGuarded() {
  return <AdminAuthGuard><AdminFinancesPage /></AdminAuthGuard>;
}
