'use client';

// Pagos a cuentas (Tanda T2): la tabla de retiros como página propia, separada del Resumen
// financiero — DataTable con total server-side, filtros de estado/circuito/origen/fecha en el
// servidor, CSV completo y Pagar/Rechazar por ConfirmDialog contra
// /api/admin/approve|reject-withdrawal (ver finance-view.tsx).
import AdminAuthGuard from '../../admin-auth-guard';
import { AdminPage } from '@/components/admin/admin-page';
import { FinanceView } from '../finance-view';

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
