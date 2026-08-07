'use client';

import Link from 'next/link';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useAggregate } from '@/lib/firebase-aggregate';
import {
    collection, query, where, orderBy, limit, startAfter, getDocs, updateDoc, doc,
    serverTimestamp, sum, count, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useAuth } from '@/context/auth-context';
import { authedFetch, authedGet } from '@/lib/authed-fetch';
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

const PAGE_SIZE = 25;

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

    // Modal de aprobación (pide el comprobante de la transferencia)
    const [approveTarget, setApproveTarget] = useState<any | null>(null);
    const [operationRef, setOperationRef]   = useState('');
    const [approveNote, setApproveNote]     = useState('');

    // Modal de rechazo
    const [rejectDialogId, setRejectDialogId]     = useState<string | null>(null);
    const [rejectReason, setRejectReason]         = useState('');
    const [submittingReject, setSubmittingReject] = useState(false);

    // ── Métricas: aggregation server-side (Fase Z/GG) ────────────────────────────
    // Antes se bajaba la colección `withdrawals` ENTERA para sumar en el cliente. Es la
    // única colección de plata que crece sin techo (un doc por cada retiro histórico) y
    // era la última que quedaba sin paginar en el panel.
    //
    // 🚨 Las 3 tarjetas IGNORABAN el circuito elegido (tiendas / repartidores): al filtrar
    // "A repartidores" la tabla mostraba solo repartidores pero los totales de arriba
    // seguían siendo de toda la plataforma. Ahora el `userRole` viaja en la query, igual
    // que en la tabla. Índice: (status, userRole, amount).
    const aggQuery = useCallback((status: string) => {
        if (!firestore) return null;
        const cons: any[] = [where('status', '==', status)];
        if (roleFilter !== 'all') cons.push(where('userRole', '==', roleFilter));
        return query(collection(firestore, 'withdrawals'), ...cons);
    }, [firestore, roleFilter]);

    const pendingAggQ  = useMemoFirebase(() => aggQuery('pending'),  [aggQuery]);
    const approvedAggQ = useMemoFirebase(() => aggQuery('approved'), [aggQuery]);
    const rejectedAggQ = useMemoFirebase(() => aggQuery('rejected'), [aggQuery]);
    const { data: pendingAgg, refresh: refreshPending, error: pendingErr }   = useAggregate(pendingAggQ,  { total: sum('amount'), n: count() }, { refreshOnFocus: true });
    const { data: approvedAgg, refresh: refreshApproved, error: approvedErr } = useAggregate(approvedAggQ, { total: sum('amount'), n: count() }, { refreshOnFocus: true });
    const { data: rejectedAgg, refresh: refreshRejected, error: rejectedErr } = useAggregate(rejectedAggQ, { total: sum('amount'), n: count() }, { refreshOnFocus: true });
    const refreshMetrics = useCallback(() => { refreshPending(); refreshApproved(); refreshRejected(); }, [refreshPending, refreshApproved, refreshRejected]);
    // Si falta un índice, la aggregation devuelve null y las tarjetas mostrarían $0 como si
    // no hubiera plata — el mismo síntoma silencioso que ya mordió en el dashboard (Fase HH).
    const aggError = pendingErr || approvedErr || rejectedErr;

    const metrics = {
        pending: pendingAgg?.total ?? 0,
        pendingCount: pendingAgg?.n ?? 0,
        paid: approvedAgg?.total ?? 0,
        rejected: rejectedAgg?.total ?? 0,
        totalCount: (pendingAgg?.n ?? 0) + (approvedAgg?.n ?? 0) + (rejectedAgg?.n ?? 0),
    };

    // ── Pasivo real: cuánto se debe HOY, incluida la plata que nadie solicitó ─────
    // La tarjeta que había antes ("Total en sistema") sumaba pendiente + pagado + rechazado:
    // mezclaba plata que ya salió con plata que nunca salió y contaba el mismo retiro dos
    // veces a lo largo de su vida. No era ningún número real.
    //
    // El pasivo verdadero no vive en `withdrawals` — hay que calcularlo desde los pedidos
    // entregados, con la MISMA fórmula que el servidor usa para autorizar un pago. Por eso
    // va por API (`/api/admin/liability`) y bajo demanda: es O(tiendas + repartidores).
    const [liability, setLiability] = useState<any | null>(null);
    const [loadingLiability, setLoadingLiability] = useState(false);

    const loadLiability = async () => {
        if (!user) return;
        setLoadingLiability(true);
        try {
            const res = await authedGet('/api/admin/liability', user);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al calcular');
            setLiability(data);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'No se pudo calcular el pasivo', description: err.message });
        } finally {
            setLoadingLiability(false);
        }
    };

    // ── Tabla paginada con cursor + filtros SERVER-SIDE ──────────────────────────
    // Los filtros van en la query (no en memoria) para que "Pendientes" muestre TODOS los
    // pendientes y no solo los que entraron en la página ya cargada. Índices compuestos
    // nuevos en firestore.indexes.json: (status, createdAt), (userRole, createdAt) y
    // (status, userRole, createdAt).
    const [rows, setRows] = useState<any[]>([]);
    const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [withdrawalsLoading, setWithdrawalsLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
        if (!firestore) return null;
        const cons: any[] = [];
        if (statusFilter !== 'all') cons.push(where('status', '==', statusFilter));
        if (roleFilter !== 'all') cons.push(where('userRole', '==', roleFilter));
        cons.push(orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        if (cursor) cons.push(startAfter(cursor));
        return query(collection(firestore, 'withdrawals'), ...cons);
    }, [firestore, statusFilter, roleFilter]);

    const resetLoad = useCallback(async () => {
        const q = buildQuery(null);
        if (!q) return;
        setWithdrawalsLoading(true);
        try {
            const snap = await getDocs(q);
            setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLastSnap(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === PAGE_SIZE);
        } catch (e) {
            console.error(e);
        } finally {
            setWithdrawalsLoading(false);
        }
    }, [buildQuery]);

    useEffect(() => { resetLoad(); }, [resetLoad]);

    const loadMore = async () => {
        const q = buildQuery(lastSnap);
        if (!q || !lastSnap) return;
        setLoadingMore(true);
        try {
            const snap = await getDocs(q);
            setRows(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
            setLastSnap(snap.docs[snap.docs.length - 1] || lastSnap);
            setHasMore(snap.docs.length === PAGE_SIZE);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingMore(false);
        }
    };

    // Refresca tabla + métricas después de aprobar/rechazar (antes el listener en vivo lo
    // hacía solo; ahora que es one-shot hay que pedirlo explícito).
    const refreshAll = useCallback(() => { resetLoad(); refreshMetrics(); }, [resetLoad, refreshMetrics]);

    const displayed = rows;

    // Exportar CSV — exporta lo que está cargado en pantalla (usar "Cargar más" antes si
    // se necesita el histórico completo).
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
            'N° operación':    w.operationRef || '',
            'Aprobado por':    w.approvedBy || '',
            'Nota admin':      w.adminNote || '',
            'Motivo rechazo':  w.rejectionReason || '',
        }));
        const now = format(new Date(), 'yyyy-MM-dd', { locale: es });
        downloadCsv(rows, `retiros_${now}.csv`);
    };

    // Aprobar. Ya no alcanza un confirm(): la transferencia se hace POR FUERA (banco/MP) y
    // hay que registrar el comprobante para poder rastrear el pago después.
    const openApproveDialog = (w: any) => {
        setOperationRef('');
        setApproveNote('');
        setApproveTarget(w);
    };

    const handleApprove = async () => {
        if (!user || !approveTarget) return;
        const opRef = operationRef.trim();
        if (opRef.length < 4) {
            toast({ variant: 'destructive', title: 'Falta el número de operación', description: 'Es el comprobante de la transferencia que ya hiciste.' });
            return;
        }
        setIsProcessing(approveTarget.id);
        try {
            const res = await authedFetch('/api/admin/approve-withdrawal', user, {
                withdrawalId: approveTarget.id, operationRef: opRef, note: approveNote.trim(),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al aprobar');
            toast({ title: 'Pago registrado', description: `$${data.amountApproved?.toLocaleString()} descontados del saldo.` });
            // El registro de auditoría lo escribe la propia API (admin-audit-server), en la
            // misma request que mueve la plata — antes se hacía acá y podía perderse.
            setApproveTarget(null);
            refreshAll();
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

    // Rechazar devuelve la plata al saldo disponible del usuario: es una operación de dinero
    // y hasta ahora era un updateDoc directo del cliente, sin registrar quién la hizo. Va por
    // API (token verificado, `rejectedBy`, auditoría server-side) igual que la aprobación.
    const handleReject = async () => {
        if (!rejectDialogId || !user) return;
        setSubmittingReject(true);
        try {
            const res = await authedFetch('/api/admin/reject-withdrawal', user, {
                withdrawalId: rejectDialogId, reason: rejectReason.trim(),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al rechazar');
            toast({ title: 'Solicitud rechazada', description: 'El monto vuelve al saldo disponible del usuario.' });
            setRejectDialogId(null);
            refreshAll();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error al rechazar', description: err.message });
        } finally {
            setSubmittingReject(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {aggError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <strong>Los totales de arriba no se pudieron calcular.</strong> Probablemente
                    falte un índice de Firestore (<code className="text-xs">withdrawals: status + userRole + amount</code>).
                    No los tomes como $0 — desplegá el índice y volvé a entrar.
                </div>
            )}

            {/* ── Separación por destinatario ──────────────────────────────────────
                Pedido explícito: los pagos a TIENDAS y a REPARTIDORES no deben mezclarse.
                Antes eran un chip más entre otros, así que era fácil aprobar el pago
                equivocado. Ahora son pestañas grandes y TODO lo de abajo (totales incluidos)
                queda acotado a ese circuito — antes las tarjetas ignoraban este filtro. */}
            <div className="grid gap-2 sm:grid-cols-3">
                {([
                    { k: 'all',      label: 'Todos los pagos', hint: 'vista combinada', icon: Wallet },
                    { k: 'store',    label: 'A tiendas',       hint: 'venta de productos', icon: DollarSign },
                    { k: 'delivery', label: 'A repartidores',  hint: 'envíos realizados', icon: TrendingUp },
                ] as { k: RoleFilter; label: string; hint: string; icon: any }[]).map(({ k, label, hint, icon: Icon }) => {
                    const active = roleFilter === k;
                    return (
                        <button
                            key={k}
                            onClick={() => setRoleFilter(k)}
                            className={cn(
                                'rounded-xl border p-3 text-left transition-all',
                                active
                                    ? 'border-primary/40 bg-primary/10 shadow-sm'
                                    : 'border-border bg-card/50 hover:bg-muted/40',
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                                <span className={cn('text-sm font-semibold', active && 'text-primary')}>{label}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
                        </button>
                    );
                })}
            </div>

            {/* Métricas — de los retiros del circuito elegido arriba */}
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
                {/* Pasivo real — reemplaza a "Total en sistema", que sumaba
                    pendiente + pagado + rechazado (un número que no significaba nada). */}
                <Card className="shadow-sm border-primary/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pasivo real</CardTitle>
                        <Wallet className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        {liability ? (
                            <>
                                <div className="text-2xl font-bold text-primary">
                                    ${(liability.storeLiability + liability.driverLiability).toLocaleString('es-AR')}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Tiendas ${liability.storeLiability.toLocaleString('es-AR')} ·
                                    Repartidores ${liability.driverLiability.toLocaleString('es-AR')}
                                </p>
                            </>
                        ) : (
                            <>
                                <Button size="sm" variant="outline" className="h-8 w-full text-xs gap-1.5"
                                    onClick={loadLiability} disabled={loadingLiability}>
                                    {loadingLiability
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Wallet className="h-3.5 w-3.5" />}
                                    Calcular lo que se debe
                                </Button>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                    Incluye el saldo que todavía nadie solicitó.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Detalle del pasivo: a quién se le debe y a quién se le pagó de más */}
            {liability && (
                <Card className="shadow-sm">
                    <CardHeader className="py-3 px-4 border-b">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                A quién se le debe ({liability.counts.stores} tienda{liability.counts.stores !== 1 ? 's' : ''} · {liability.counts.drivers} repartidor{liability.counts.drivers !== 1 ? 'es' : ''})
                            </CardTitle>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={loadLiability} disabled={loadingLiability}>
                                {loadingLiability ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Recalcular'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        {/* La cuenta que produce cada número, siempre visible: sin esto el
                            panel era una lista de montos sueltos que confundía. */}
                        <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 border p-2.5">
                            <strong>Cómo se calcula:</strong> lo que cada cuenta <strong>ganó</strong> por
                            sus pedidos entregados (neto: sin envío ni tarifa, menos comisión y reembolsos)
                            <strong> − lo que ya se le pagó</strong> por retiros. Lo &quot;solicitado&quot; es
                            parte de la deuda que ya tiene un retiro pendiente esperando tu aprobación.
                        </p>

                        {liability.overpaid?.length > 0 && (
                            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-2">
                                <strong className="text-destructive">Se le pagó de más a {liability.overpaid.length}:</strong>
                                {liability.overpaid.map((o: any) => (
                                    <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                                        <Link
                                            href={o.role === 'store' ? `/admin/stores/${o.id}` : `/admin/delivery/${o.id}`}
                                            className="truncate hover:underline text-foreground"
                                        >
                                            {o.name}
                                        </Link>
                                        <span className="text-muted-foreground whitespace-nowrap">
                                            cobró ${o.paid?.toLocaleString('es-AR')} · sus ventas justifican ${o.earned?.toLocaleString('es-AR')} →
                                            <strong className="text-destructive"> debe ${o.debt.toLocaleString('es-AR')}</strong>
                                        </span>
                                    </div>
                                ))}
                                <p className="text-[11px] text-muted-foreground">
                                    Suele pasar al reembolsar un pedido ya liquidado (o por retiros de datos de
                                    prueba sin ventas que los respalden). No se le vuelve a pagar hasta que sus
                                    ventas futuras absorban la deuda. Tocá el nombre para ver su estado de cuenta.
                                </p>
                            </div>
                        )}

                        {liability.top?.length === 0 && (
                            <p className="text-sm text-muted-foreground">No se le debe nada a nadie ahora mismo.</p>
                        )}
                        {liability.top?.map((r: any) => (
                            <div key={`${r.role}-${r.id}`} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className={cn('text-[10px] uppercase shrink-0',
                                            r.role === 'store' ? 'border-info/40 text-info' : 'border-primary/40 text-primary')}>
                                            {r.role === 'store' ? 'Tienda' : 'Repartidor'}
                                        </Badge>
                                        {/* Link a la ficha: ahí está el estado de cuenta movimiento
                                            por movimiento que explica este número. */}
                                        <Link
                                            href={r.role === 'store' ? `/admin/stores/${r.id}` : `/admin/delivery/${r.id}`}
                                            className="truncate font-medium hover:underline"
                                        >
                                            {r.name}
                                        </Link>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        ganó ${r.earned?.toLocaleString('es-AR')} · ya cobró ${r.paid?.toLocaleString('es-AR')}
                                        {r.pending > 0 && <> · <span className="text-warning">${Math.round(r.pending).toLocaleString('es-AR')} solicitados esperando aprobación</span></>}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-bold">${r.owed.toLocaleString('es-AR')}</div>
                                    <div className="text-[10px] text-muted-foreground">se le debe</div>
                                </div>
                            </div>
                        ))}

                        {liability.top?.length > 0 && (
                            <p className="text-xs text-muted-foreground text-right pt-1">
                                Total: <strong className="text-foreground">
                                    ${(liability.storeLiability + liability.driverLiability).toLocaleString('es-AR')}
                                </strong> — coincide con la tarjeta &quot;Pasivo real&quot;.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Estado dentro del circuito elegido */}
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
                                        {/* Comprobante de la transferencia real: es lo que permite
                                            rastrear el pago si después reclaman que no llegó. */}
                                        {w.status === 'approved' && w.operationRef && (
                                            <p className="mt-1 font-mono text-[10px] text-muted-foreground" title="Número de operación">
                                                op {w.operationRef}
                                            </p>
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
                                                    onClick={() => openApproveDialog(w)}
                                                    disabled={!!isProcessing}
                                                    title="Registrar el pago (pide comprobante)">
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
                {hasMore && !withdrawalsLoading && (
                    <div className="flex justify-center border-t py-3">
                        <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Cargar más
                        </Button>
                    </div>
                )}
            </Card>

            {/* Modal de aprobación: exige el comprobante de la transferencia real */}
            <Dialog open={!!approveTarget} onOpenChange={open => { if (!open) setApproveTarget(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Registrar pago</DialogTitle>
                    </DialogHeader>

                    {approveTarget && (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Destinatario</span>
                                <span className="font-medium">{approveTarget.userName}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Tipo</span>
                                <span className="font-medium">{approveTarget.userRole === 'store' ? 'Tienda' : 'Repartidor'}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">CBU / Alias</span>
                                <span className="font-mono text-xs">{approveTarget.cbu || '—'}</span>
                            </div>
                            <div className="flex justify-between gap-2 border-t pt-1.5">
                                <span className="text-muted-foreground">Monto a transferir</span>
                                <span className="text-base font-bold">${(approveTarget.amount || 0).toLocaleString('es-AR')}</span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="opref">Número de operación / comprobante *</Label>
                            <Input id="opref" value={operationRef} onChange={e => setOperationRef(e.target.value)}
                                placeholder="Ej: 4821-9930 (el que te da el banco o MP)" />
                            <p className="text-xs text-muted-foreground">
                                Queda guardado con el pago. Sin esto no hay forma de rastrear la transferencia si después reclaman.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="opnote">Nota interna (opcional)</Label>
                            <Textarea id="opnote" value={approveNote} onChange={e => setApproveNote(e.target.value)} rows={2}
                                placeholder="Ej: transferido desde la cuenta de MercadoPago." />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={!!isProcessing}>Cancelar</Button>
                        <Button
                            className="bg-success hover:bg-success/90 text-success-foreground gap-2"
                            onClick={handleApprove}
                            disabled={!!isProcessing || operationRef.trim().length < 4}
                        >
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Ya transferí — registrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
