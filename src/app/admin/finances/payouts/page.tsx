'use client';

// Pagos a cuentas (ruta nueva del menú final, Tanda T1). La tabla de retiros de finance-view
// como página propia, separada del Resumen financiero. T2 la migra a DataTable con total
// server-side, filtros de origen/fecha/cuenta y CSV completo; mientras tanto reusa el
// componente actual tal cual (ya va todo por /api/admin/approve|reject-withdrawal).
import AdminAuthGuard from '../../admin-auth-guard';
import { AdminPage } from '@/components/admin/admin-page';
import { FinanceView } from '../../dashboard/finance-view';

export default function AdminPayoutsPage() {
  return (
    <AdminAuthGuard requireFullAdmin>
      <AdminPage
        title="Pagos a cuentas"
        subtitle="Solicitudes de retiro de tiendas y repartidores. Aprobar NO transfiere: registrás la transferencia que ya hiciste, con su comprobante."
        crumbs={[{ label: 'Finanzas' }, { label: 'Pagos a cuentas' }]}
        wide
      >
        <FinanceView />
      </AdminPage>
    </AdminAuthGuard>
  );
}
