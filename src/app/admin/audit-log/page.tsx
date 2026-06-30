'use client';

import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  approve_withdrawal:  { label: 'Retiro aprobado',    color: 'bg-success/15 text-success border-success/30' },
  reject_withdrawal:   { label: 'Retiro rechazado',   color: 'bg-destructive/15 text-destructive border-destructive/30' },
  change_role:         { label: 'Rol cambiado',        color: 'bg-info/15 text-info border-info/30' },
  delete_user:         { label: 'Usuario eliminado',   color: 'bg-destructive/15 text-destructive border-destructive/30' },
  delete_review:       { label: 'Reseña eliminada',    color: 'bg-warning/15 text-warning border-warning/30' },
};

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy HH:mm:ss", { locale: es }); } catch { return '—'; }
};

function AdminAuditLogPage() {
  const firestore = useFirestore();

  const logQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'admin_audit_log'), orderBy('createdAt', 'desc'), limit(200));
  }, [firestore]);

  const { data: entries, isLoading } = useCollection<any>(logQuery);

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title="Log de Acciones Admin"
        description="Últimas 200 acciones sensibles registradas en el panel."
      />

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && (!entries || entries.length === 0) && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto opacity-30" />
            <p>No hay acciones registradas todavía.</p>
            <p className="text-xs">El log se activa a partir de las próximas acciones sensibles (aprobar retiros, cambiar roles, etc.).</p>
          </CardContent>
        </Card>
      )}

      {entries && entries.length > 0 && (
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
                {entries.map(entry => {
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
