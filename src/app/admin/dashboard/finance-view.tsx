'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/auth-context';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    Loader2, CheckCircle2, DollarSign, XCircle,
    Clock, TrendingUp, Wallet, Ban, Download
} from 'lucide-react';
import { downloadCsv } from '@/lib/csv-export';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type RoleFilter  = 'all' | 'store' | 'delivery';

const formatDate = (ts: any, full = false) => {
    if (!ts?.seconds) return '—';
    try {
        return format(ts.toDate(), full ? 'dd/MM/yyyy HH:mm' : 'dd/MM HH:mm', { locale: es });
    } catch { return '—'; }
};

export function FinanceView() {
    const firestore = useFirestore();
    const { user } = useAuth();
    const { toast } = useToast();

    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // Filtros
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [roleFilter, setRoleFilter]   = useState<RoleFilter>('all');

    // Modal de rechazo
    const [rejectDialogId, setRejectDialogId]     = useState<string | null>(null);
    const [rejectReason, setRejectReason]         = useState('');
    const [submittingReject, setSubmittingReject] = useState(false);

    const withdrawalsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'withdrawals'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const { data: withdrawals, isLoading: withdrawalsLoading } = useCollection<any>(withdrawalsQuery);

    // Métricas
    const metrics = useMemo(() => {
        if (!withdrawals) return { pending: 0, paid: 0, rejected: 0, pendingCount: 0 };
        return withdrawals.reduce((acc, w) => {
            if (w.status === 'pending')  { acc.pending += w.amount || 0; acc.pendingCount++; }
            if (w.status === 'approved') acc.paid     += w.amount || 0;
            if (w.status === 'rejected') acc.rejected += w.amount || 0;
            return acc;
        }, { pending: 0, paid: 0, rejected: 0, pendingCount: 0 });
    }, [withdrawals]);

    // Tabla filtrada
    const displayed = useMemo(() => {
        if (!withdrawals) return [];
        return withdrawals.filter(w => {
            if (statusFilter !== 'all' && w.status !== statusFilter) return false;
            if (roleFilter !== 'all'   && w.userRole !== roleFilter)  return false;
            return true;
        });
    }, [withdrawals, statusFilter, roleFilter]);

    // Exportar CSV
    const handleExportCsv = () => {
        const rows = displayed.map((w: any) => ({
            'Fecha solicitud': w.createdAt?.seconds ? format(w.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es }) : '',
            'Fecha procesado': w.processedAt?.seconds ? format(w.processedAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es }) : '',
            'Usuario':         w.userName || '',
            'Rol':             w.userRole === 'store' ? 'Tienda' : 'Repartidor',
            'Monto':           w.amount ?? 0,
            'CBU/Alias':       w.cbu || '',
            'Estado':          w.status === 'pending' ? 'Pendiente' : w.status === 'approved' ? 'Pagado' : 'Rechazado',
            'Origen':          w.source === 'auto' ? 'Automático' : 'Manual',
            'Motivo rechazo':  w.rejectionReason || '',
        }));
        const now = format(new Date(), 'yyyy-MM-dd', { locale: es });
        downloadCsv(rows, `retiros_${now}.csv`);
    };

    // Aprobar
    const handleApprove = async (withdrawalId: string) => {
        if (!user) return;
        if (!confirm('¿Confirmás que ya realizaste la transferencia bancaria?')) return;
        setIsProcessing(withdrawalId);
        try {
            const res = await authedFetch('/api/admin/approve-withdrawal', user, { withdrawalId });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al aprobar');
            toast({ title: 'Pago registrado', description: `$${data.amountApproved?.toLocaleString()} descontados del saldo.` });
            if (firestore) logAdminAction(firestore, user.uid, 'approve_withdrawal', withdrawalId, `$${data.amountApproved}`);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error al aprobar', description: err.message });
        } finally {
            setIsProcessing(null);
        }
    };

    // Rechazar (modal)
    const openRejectDialog = (withdrawalId: string) => {
        setRejectReason('');
        setRejectDialogId(withdrawalId);
    };

    const handleReject = async () => {
        if (!rejectDialogId || !firestore || !user) return;
        setSubmittingReject(true);
        try {
            await updateDoc(doc(firestore, 'withdrawals', rejectDialogId), {
                status: 'rejected',
                rejectionReason: rejectReason.trim() || '',
                processedAt: serverTimestamp(),
            });
            toast({ title: 'Solicitud rechazada', description: 'El monto vuelve al saldo disponible del usuario.' });
            logAdminAction(firestore, user.uid, 'reject_withdrawal', rejectDialogId, rejectReason.trim());
            setRejectDialogId(null);
        } catch {
            toast({ variant: 'destructive', title: 'Error al rechazar' });
        } finally {
            setSubmittingReject(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* Métricas */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pendiente de pago</CardTitle>
                        <Clock className="h-4 w-4 text-warning" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-warning">${metrics.pending.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">{metrics.pendingCount} solicitud{metrics.pendingCount !== 1 ? 'es' : ''}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total pagado</CardTitle>
                        <TrendingUp className="h-4 w-4 text-success" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-success">${metrics.paid.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Histórico acumulado</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total rechazado</CardTitle>
                        <Ban className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">${metrics.rejected.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Volvió al saldo del usuario</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total en sistema</CardTitle>
                        <Wallet className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(metrics.pending + metrics.paid + metrics.rejected).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">{withdrawals?.length ?? 0} solicitudes totales</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        { k: 'all',      label: 'Todos' },
                        { k: 'pending',  label: 'Pendientes' },
                        { k: 'approved', label: 'Pagados' },
                        { k: 'rejected', label: 'Rechazados' },
                    ] as { k: StatusFilter; label: string }[]).map(({ k, label }) => (
                        <button key={k} onClick={() => setStatusFilter(k)}
                            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                                statusFilter === k
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            )}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        { k: 'all',      label: 'Todos los roles' },
                        { k: 'store',    label: 'Tiendas' },
                        { k: 'delivery', label: 'Repartidores' },
                    ] as { k: RoleFilter; label: string }[]).map(({ k, label }) => (
                        <button key={k} onClick={() => setRoleFilter(k)}
                            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                                roleFilter === k
                                    ? 'bg-secondary text-secondary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            )}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabla */}
            <Card className="shadow-md overflow-hidden">
                <CardHeader className="border-b py-3 px-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            {withdrawalsLoading ? 'Cargando...' : `${displayed.length} solicitud${displayed.length !== 1 ? 'es' : ''}`}
                        </CardTitle>
                        {displayed.length > 0 && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1.5" onClick={handleExportCsv}>
                                <Download className="h-3.5 w-3.5" /> Exportar CSV
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha solicitud</TableHead>
                                <TableHead>Usuario</TableHead>
                                <TableHead>Rol</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>CBU / Alias</TableHead>
                                <TableHead>Origen</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Procesado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {withdrawalsLoading && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            )}
                            {!withdrawalsLoading && displayed.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                        No hay solicitudes con los filtros seleccionados.
                                    </TableCell>
                                </TableRow>
                            )}
                            {displayed.map((w: any) => (
                                <TableRow key={w.id} className={cn(
                                    w.status === 'pending' ? 'bg-warning/5' : ''
                                )}>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDate(w.createdAt)}
                                    </TableCell>
                                    <TableCell className="font-medium">{w.userName}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn('text-[10px] uppercase',
                                            w.userRole === 'store' ? 'border-info/40 text-info' : 'border-primary/40 text-primary'
                                        )}>
                                            {w.userRole === 'store' ? 'Tienda' : 'Repartidor'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-bold">${(w.amount || 0).toLocaleString()}</TableCell>
                                    <TableCell className="font-mono text-xs max-w-[140px] truncate" title={w.cbu}>
                                        {w.cbu || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {w.source === 'auto'
                                            ? <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Automático</Badge>
                                            : <Badge variant="outline" className="text-[10px] text-muted-foreground">Manual</Badge>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            w.status === 'approved' ? 'default' :
                                            w.status === 'rejected' ? 'destructive' : 'secondary'
                                        } className={w.status === 'pending' ? 'bg-warning/15 text-warning hover:bg-warning/25' : w.status === 'approved' ? 'bg-success text-success-foreground' : ''}>
                                            {w.status === 'pending' ? 'Pendiente' : w.status === 'approved' ? 'Pagado' : 'Rechazado'}
                                        </Badge>
                                        {w.status === 'rejected' && w.rejectionReason && (
                                            <p className="text-[11px] text-muted-foreground mt-1 max-w-[160px] line-clamp-2">{w.rejectionReason}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                        {w.processedAt ? formatDate(w.processedAt) : '—'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {w.status === 'pending' && (
                                            <div className="flex justify-end gap-1.5">
                                                <Button size="sm" variant="outline"
                                                    className="h-8 px-2 text-xs text-success border-success/30 hover:bg-success/10 gap-1"
                                                    onClick={() => handleApprove(w.id)}
                                                    disabled={!!isProcessing}
                                                    title="Confirmar pago">
                                                    {isProcessing === w.id
                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                                                    Pagar
                                                </Button>
                                                <Button size="sm" variant="outline"
                                                    className="h-8 w-8 p-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                                                    onClick={() => openRejectDialog(w.id)}
                                                    disabled={!!isProcessing}
                                                    title="Rechazar">
                                                    <XCircle className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* Modal de rechazo */}
            <Dialog open={!!rejectDialogId} onOpenChange={open => { if (!open) setRejectDialogId(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rechazar solicitud de retiro</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label>Motivo del rechazo <span className="text-muted-foreground">(opcional — lo verá el usuario)</span></Label>
                        <Textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Ej: El CBU ingresado no es válido. Por favor actualizalo desde tu billetera."
                            rows={3}
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setRejectDialogId(null)} disabled={submittingReject}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleReject} disabled={submittingReject} className="gap-1">
                            {submittingReject && <Loader2 className="h-4 w-4 animate-spin" />}
                            Confirmar rechazo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
