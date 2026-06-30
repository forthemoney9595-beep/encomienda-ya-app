'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
// ✅ Importamos Hooks de Firestore para la nueva lógica de retiros
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/auth-context';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Wallet, DollarSign, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order } from '@/lib/order-service';
import type { Store } from '@/lib/placeholder-data';

interface FinanceViewProps {
    orders: Order[];
    stores: Store[];
    users: any[];
}

export function FinanceView({ orders, stores, users }: FinanceViewProps) {
    const firestore = useFirestore();
    const { user } = useAuth();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // --- 1. LÓGICA DE SOLICITUDES DE RETIRO (NUEVO SISTEMA) ---
    const withdrawalsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'withdrawals'), orderBy('createdAt', 'desc'));
    }, [firestore]);
  
    const { data: withdrawals, isLoading: withdrawalsLoading } = useCollection<any>(withdrawalsQuery);

    // Aprobar Solicitud (Nuevo Sistema) — ahora va por la API que recalcula el saldo real
    const handleApproveWithdrawal = async (withdrawalId: string) => {
        if (!user) return;
        if (!confirm("¿Confirmás que ya realizaste la transferencia bancaria?")) return;

        setIsProcessing(withdrawalId);
        try {
            const res = await authedFetch('/api/admin/approve-withdrawal', user, { withdrawalId });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al aprobar');
            toast({ title: "Pago registrado", description: "El saldo ha sido descontado." });
            if (firestore) logAdminAction(firestore, user.uid, 'approve_withdrawal', withdrawalId, `$${data.amountApproved}`);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error al aprobar", description: error.message });
        } finally {
            setIsProcessing(null);
        }
    };
  
    // Rechazar Solicitud (Nuevo Sistema)
    const handleRejectWithdrawal = async (withdrawalId: string) => {
        if (!firestore) return;
        const reason = prompt("Motivo del rechazo (opcional):");
        if (reason === null) return; 
  
        setIsProcessing(withdrawalId);
        try {
            await updateDoc(doc(firestore, 'withdrawals', withdrawalId), {
                status: 'rejected',
                rejectionReason: reason,
                processedAt: serverTimestamp()
            });
            toast({ title: "Solicitud rechazada", description: "El dinero volverá al saldo del usuario." });
            if (firestore && user) logAdminAction(firestore, user.uid, 'reject_withdrawal', withdrawalId, reason || '');
        } catch (error) {
            toast({ variant: "destructive", title: "Error al rechazar" });
        } finally {
            setIsProcessing(null);
        }
    };

    // Estadísticas de Solicitudes
    const pendingRequestsTotal = withdrawals?.filter((w: any) => w.status === 'pending').reduce((sum: number, w: any) => sum + w.amount, 0) || 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* SECCIÓN 1: SOLICITUDES DE RETIRO (NUEVO SISTEMA) */}
            <Card className="border-l-4 border-l-warning shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                        <DollarSign className="h-5 w-5" /> Solicitudes de Retiro (Pendientes: ${pendingRequestsTotal.toLocaleString()})
                    </CardTitle>
                    <CardDescription>
                        Aquí aparecen los usuarios que solicitaron retirar dinero desde su billetera.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Usuario</TableHead>
                                <TableHead>Rol</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>CBU/Alias</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {withdrawals?.map((w: any) => (
                                <TableRow key={w.id}>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {w.createdAt?.seconds ? format(w.createdAt.toDate(), "dd/MM HH:mm", { locale: es }) : '-'}
                                    </TableCell>
                                    <TableCell className="font-medium">{w.userName}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px] uppercase">{w.userRole}</Badge></TableCell>
                                    <TableCell className="font-bold">${w.amount.toLocaleString()}</TableCell>
                                    <TableCell className="font-mono text-xs">{w.cbu}</TableCell>
                                    <TableCell>
                                        <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'} className={w.status === 'pending' ? 'bg-warning/15 text-warning hover:bg-warning/25' : ''}>
                                            {w.status === 'pending' ? 'Pendiente' : w.status === 'approved' ? 'Pagado' : 'Rechazado'}
                                        </Badge>
                                        {w.status === 'rejected' && w.rejectionReason && (
                                            <p className="text-[11px] text-muted-foreground mt-1 max-w-[160px] line-clamp-2">{w.rejectionReason}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {w.status === 'pending' && (
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-success border-success/30 hover:bg-success/10" onClick={() => handleApproveWithdrawal(w.id)} disabled={!!isProcessing} title="Confirmar Pago">
                                                    {isProcessing === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleRejectWithdrawal(w.id)} disabled={!!isProcessing} title="Rechazar">
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {(!withdrawals || withdrawals.length === 0) && (
                                <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">No hay solicitudes.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* La sección "Auditoría de Deudas" fue eliminada en la Fase N2.
                Usaba storePayoutStatus/deliveryPayoutStatus en cada pedido para calcular
                deudas, pero ese cálculo difería del que usa la billetera de la tienda
                (basado en la colección withdrawals). Tener dos sistemas paralelos con
                cifras distintas confundía al admin y creaba riesgo de doble pago.
                La colección withdrawals + /api/admin/approve-withdrawal es la única
                fuente de verdad ahora. */}
        </div>
    );
}