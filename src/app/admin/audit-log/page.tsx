'use client';

import { useMemo, useState } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, ShieldCheck, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lista cerrada de las acciones que logAdminAction() realmente escribe en toda la app
// (ver grep de `logAdminAction(` antes de esta fase -- faltaban approve_withdrawal y
// refund_order, que existían pero nunca tuvieron label: se veían como texto crudo).
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  approve_withdrawal:      { label: 'Retiro aprobado',        color: 'bg-success/15 text-success border-success/30' },
  reject_withdrawal:       { label: 'Retiro rechazado',       color: 'bg-destructive/15 text-destructive border-destructive/30' },
  change_role:              { label: 'Rol cambiado',           color: 'bg-info/15 text-info border-info/30' },
  change_admin_level:       { label: 'Nivel de admin cambiado', color: 'bg-info/15 text-info border-info/30' },
  delete_user:              { label: 'Usuario eliminado',      color: 'bg-destructive/15 text-destructive border-destructive/30' },
  delete_review:            { label: 'Reseña eliminada',       color: 'bg-warning/15 text-warning border-warning/30' },
  refund_order:             { label: 'Pedido reembolsado',     color: 'bg-warning/15 text-warning border-warning/30' },
  resolve_payment_mismatch: { label: 'Discrepancia resuelta',  color: 'bg-success/15 text-success border-success/30' },
  resolve_driver_incident:  { label: 'Incidente resuelto',     color: 'bg-success/15 text-success border-success/30' },
  // Fase GG: acciones sensibles que se ejecutaban sin dejar NINGÚN rastro (aprobar una
  // tienda/repartidor, pausar una tienda, cancelar un pedido, cambiar un CBU o los fees
  // globales, mandar un broadcast a toda la plataforma).
  approve_account:          { label: 'Cuenta aprobada',        color: 'bg-success/15 text-success border-success/30' },
  reject_account:           { label: 'Cuenta rechazada',       color: 'bg-destructive/15 text-destructive border-destructive/30' },
  pause_store:              { label: 'Tienda pausada',         color: 'bg-warning/15 text-warning border-warning/30' },
  unpause_store:            { label: 'Tienda reactivada',      color: 'bg-success/15 text-success border-success/30' },
  edit_driver:              { label: 'Repartidor editado',     color: 'bg-info/15 text-info border-info/30' },
  edit_cbu:                 { label: 'CBU modificado',         color: 'bg-warning/15 text-warning border-warning/30' },
  cancel_order:             { label: 'Pedido cancelado',       color: 'bg-destructive/15 text-destructive border-destructive/30' },
  update_config:            { label: 'Configuración global',   color: 'bg-warning/15 text-warning border-warning/30' },
  send_broadcast:           { label: 'Broadcast enviado',      color: 'bg-info/15 text-info border-info/30' },
};

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy HH:mm:ss", { locale: es }); } catch { return '—'; }
};

function AdminAuditLogPage() {
  const firestore = useFirestore();
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');

  const logQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'admin_audit_log'), orderBy('createdAt', 'desc'), limit(200));
  }, [firestore]);

  const { data: entries, isLoading } = useCollection<any>(logQuery);

  // Filtro/búsqueda en memoria sobre la ventana de 200 ya cargada -- no dispara consultas
  // nuevas, mismo criterio que el buscador de admin/reviews sobre substring.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (entries || []).filter(e => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (term && !(`${e.detail || ''} ${e.targetId || ''} ${e.adminUid || ''}`).toLowerCase().includes(term)) return false;
      return true;
    });
  }, [entries, actionFilter, search]);

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title="Log de Acciones Admin"
        description="Últimas 200 acciones sensibles registradas en el panel."
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por detalle, ID o admin..." className="pl-9" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Todas las acciones" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {Object.entries(ACTION_LABELS).map(([value, meta]) => (
              <SelectItem key={value} value={value}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto opacity-30" />
            <p>{entries && entries.length > 0 ? 'Sin resultados con ese filtro.' : 'No hay acciones registradas todavía.'}</p>
            {!(entries && entries.length > 0) && (
              <p className="text-xs">El log se activa a partir de las próximas acciones sensibles (aprobar retiros, cambiar roles, etc.).</p>
            )}
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Acción</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Detalle</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">ID afectado</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Admin UID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(entry => {
                  const meta = ACTION_LABELS[entry.action];
                  return (
                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('text-[10px]', meta?.color ?? 'bg-muted text-muted-foreground')}>
                          {meta?.label ?? entry.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{entry.detail || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.targetId?.slice(0, 12)}…</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.adminUid?.slice(0, 12)}…</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AdminAuditLogPageGuarded() {
  return <AdminAuthGuard><AdminAuditLogPage /></AdminAuthGuard>;
}
