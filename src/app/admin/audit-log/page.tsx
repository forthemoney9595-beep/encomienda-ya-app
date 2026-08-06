'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, startAfter, getDocs, type QueryDocumentSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, ShieldCheck, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  // Faltaban desde siempre: `edit_store` es justo la acción que cambia la COMISIÓN de una
  // tienda (o sea, cuánta plata cobra), y se veía como texto crudo en el log.
  edit_store:               { label: 'Tienda editada',         color: 'bg-warning/15 text-warning border-warning/30' },
  delete_store:             { label: 'Tienda eliminada',       color: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const PAGE_SIZE = 50;

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy HH:mm:ss", { locale: es }); } catch { return '—'; }
};

function AdminAuditLogPage() {
  const firestore = useFirestore();
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Paginación con cursor. Antes era un `limit(200)` fijo: el log de auditoría es
  // exactamente la colección donde NUNCA hay que perder registros viejos (es la evidencia
  // de quién movió qué), y a partir de la acción 201 dejaban de ser alcanzables desde la UI.
  // El filtro por acción va SERVER-SIDE para que "Retiro aprobado" muestre todos los
  // aprobados, no solo los que entraron en la página cargada.
  const [entries, setEntries] = useState<any[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const cons: any[] = [];
    if (actionFilter !== 'all') cons.push(where('action', '==', actionFilter));
    cons.push(orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    if (cursor) cons.push(startAfter(cursor));
    return query(collection(firestore, 'admin_audit_log'), ...cons);
  }, [firestore, actionFilter]);

  const resetLoad = useCallback(async () => {
    const q = buildQuery(null);
    if (!q) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastSnap(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.code === 'failed-precondition'
        ? 'Falta un índice de Firestore (admin_audit_log: action + createdAt).'
        : 'No se pudo cargar el log.');
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { resetLoad(); }, [resetLoad]);

  const loadMore = async () => {
    const q = buildQuery(lastSnap);
    if (!q || !lastSnap) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(q);
      setEntries(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastSnap(snap.docs[snap.docs.length - 1] || lastSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // La búsqueda por texto SÍ queda en memoria sobre lo ya cargado: Firestore no hace
  // substring, y el detalle es texto libre. La UI lo aclara abajo.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter(e =>
      (`${e.detail || ''} ${e.targetId || ''} ${e.adminUid || ''}`).toLowerCase().includes(term));
  }, [entries, search]);

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title="Log de Acciones Admin"
        description="Historial completo de acciones sensibles del panel. No se puede editar ni borrar."
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

      {search.trim() && (
        <p className="text-xs text-muted-foreground">
          La búsqueda por texto solo mira las {entries.length} entradas ya cargadas.
          {hasMore && ' Usá "Cargar más" para ampliar la ventana, o filtrá por tipo de acción (eso sí busca en todo el histórico).'}
        </p>
      )}

      {loadError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

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
          {hasMore && (
            <div className="flex justify-center border-t py-3">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Cargar más
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function AdminAuditLogPageGuarded() {
  return <AdminAuthGuard><AdminAuditLogPage /></AdminAuthGuard>;
}
