'use client';

// Layout REAL del panel admin (Tanda T1 del rediseño, oct 2026). Antes era un fragmento
// vacío y cada página se envolvía sola en AdminAuthGuard. Ahora el guard se monta UNA vez
// acá y el AdminShell (sidebar 240/64, topbar con migas + ⌘K + chip En vivo/Mantenimiento,
// drawer y barra inferior en celular) envuelve a TODAS las páginas de /admin — las viejas
// siguen funcionando adentro con sus mismas rutas hasta que las tandas T2-T5 las migren.
// app-content.tsx ya no renderiza el header/sidebar/carrito del comprador bajo /admin.
import AdminAuthGuard from './admin-auth-guard';
import { AdminShell } from '@/components/admin/admin-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthGuard>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGuard>
  );
}
