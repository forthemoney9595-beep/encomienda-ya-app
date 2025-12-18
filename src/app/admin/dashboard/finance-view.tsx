'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// ✅ Importamos Hooks de Firestore para la nueva lógica de retiros
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { writeBatch, doc, serverTimestamp, collection, query, orderBy, updateDoc } from 'firebase/firestore';
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
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // --- 1. LÓGICA DE SOLICITUDES DE RETIRO (NUEVO SISTEMA) ---
    const withdrawalsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'withdrawals'), orderBy('createdAt', 'desc'));
    }, [firestore]);
  
    const { data: withdrawals, isLoading: withdrawalsLoading } = useCollection<any>(withdrawalsQuery);

    // Aprobar Solicitud (Nuevo Sistema)
    const handleApproveWithdrawal = async (withdrawalId: string) => {
        if (!firestore) return;
        if (!confirm("¿Confirmas que ya realizaste la transferencia bancaria?")) return;
  
        setIsProcessing(withdrawalId);
        try {
            await updateDoc(doc(firestore, 'withdrawals', withdrawalId), {
                status: 'approved',
                processedAt: serverTimestamp()
            });
            toast({ title: "Pago registrado", description: "El saldo ha sido descontado." });
        } catch (error) {
            toast({ variant: "destructive", title: "Error al aprobar" });
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
        } catch (error) {
            toast({ variant: "destructive", title: "Error al rechazar" });
        } finally {
            setIsProcessing(null);
        }
    };

    // --- 2. LÓGICA DE DEUDAS AUTOMÁTICAS (TU CÓDIGO ANTERIOR) ---
    // (Mantenemos esto para que puedas auditar cuánto se debe teóricamente)

    const deliveredOrders = useMemo(() => {
        return orders.filter(o => o.status === 'Entregado');
    }, [orders]);

    const storeDebts = useMemo(() => {
        const debts: Record<string, { name: string, count: number, total: number, ids: string[], commissionRate: number, ownerId?: string }> = {};
        
        deliveredOrders.forEach(order => {
            if (order.storePayoutStatus === 'paid') return;

            const storeId = order.storeId;
            const storeObj = stores.find(s => s.id === storeId);
            const storeName = storeObj?.name || order.storeName || 'Tienda Desconocida';
            const commissionPercent = storeObj?.commissionRate || 0;
            const ownerId = storeObj?.ownerId;

            if (!debts[storeId]) {
                debts[storeId] = { name: storeName, count: 0, total: 0, ids: [], commissionRate: commissionPercent, ownerId: ownerId };
            }

            const subtotal = order.subtotal || 0;
            const feeAmount = (subtotal * commissionPercent) / 100;
            const payoutAmount = subtotal - feeAmount;

            debts[storeId].total += payoutAmount;
            debts[storeId].count += 1;
            debts[storeId].ids.push(order.id);
        });
        return Object.values(debts);
    }, [deliveredOrders, stores]);

    const driverDebts = useMemo(() => {
        const debts: Record<string, { name: string, count: number, total: number, ids: string[], driverId: string }> = {};

        deliveredOrders.forEach(order => {
            if (order.deliveryPayoutStatus === 'paid') return;
            if (!order.deliveryPersonId) return;

            const driverId = order.deliveryPersonId;
            const driverName = users.find(u => u.id === driverId)?.displayName || order.deliveryPersonName || 'Repartidor';

            if (!debts[driverId]) {
                debts[driverId] = { name: driverName, count: 0, total: 0, ids: [], driverId: driverId };
            }

            const amountForDriver = order.deliveryFee || 0;
            debts[driverId].total += amountForDriver;
            debts[driverId].count += 1;
            debts[driverId].ids.push(order.id);
        });
        return Object.values(debts);
    }, [deliveredOrders, users]);

    // Función "Manual" para marcar como pagado (Old School)
    const handleManualPayout = async (type: 'store' | 'delivery', entityName: string, orderIds: string[], amount: number, recipientId?: string) => {
        if (!firestore) return;
        if (!confirm(`¿Confirmas el pago de $${amount.toLocaleString()} a ${entityName}?`)) return;

        setIsProcessing('manual');
        try {
            const batch = writeBatch(firestore);
            orderIds.forEach(orderId => {
                const orderRef = doc(firestore, 'orders', orderId);
                if (type === 'store') batch.update(orderRef, { storePayoutStatus: 'paid', payoutDate: serverTimestamp() });
                else batch.update(orderRef, { deliveryPayoutStatus: 'paid', payoutDate: serverTimestamp() });
            });
            await batch.commit();
            toast({ title: "Liquidación Manual Exitosa", className: "bg-green-50 border-green-200 text-green-800" });
        } catch (error) {
            toast({ variant: "destructive", title: "Error al liquidar" });
        } finally {
            setIsProcessing(null);
        }
    };

    const totalStoreDebt = storeDebts.reduce((acc, curr) => acc + curr.total, 0);
    const totalDriverDebt = driverDebts.reduce((acc, curr) => acc + curr.total, 0);
    
    // Estadísticas de Solicitudes
    const pendingRequestsTotal = withdrawals?.filter((w: any) => w.status === 'pending').reduce((sum: number, w: any) => sum + w.amount, 0) || 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* SECCIÓN 1: SOLICITUDES DE RETIRO (NUEVO SISTEMA) */}
            <Card className="border-l-4 border-l-yellow-500 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-800">
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
                                        <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'} className={w.status === 'pending' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : ''}>
                                            {w.status === 'pending' ? 'Pendiente' : w.status === 'approved' ? 'Pagado' : 'Rechazado'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {w.status === 'pending' && (
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleApproveWithdrawal(w.id)} disabled={!!isProcessing} title="Confirmar Pago">
                                                    {isProcessing === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleRejectWithdrawal(w.id)} disabled={!!isProcessing} title="Rechazar">
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

            {/* SECCIÓN 2: AUDITORÍA Y PAGOS MANUALES (TU SISTEMA ANTERIOR) */}
            <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4 text-muted-foreground flex items-center gap-2">
                    <Wallet className="h-5 w-5"/> Auditoría de Deudas (Cálculo Automático)
                </h3>
                
                <div className="grid gap-4 md:grid-cols-2 mb-6">
                    <Card className="bg-muted/30">
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Deuda Tiendas</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-blue-700">${totalStoreDebt.toLocaleString()}</div></CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Deuda Repartidores</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-orange-700">${totalDriverDebt.toLocaleString()}</div></CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="stores" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="stores">Tiendas (Por Pagar)</TabsTrigger>
                        <TabsTrigger value="drivers">Repartidores (Por Pagar)</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="stores">
                        <Card>
                            <CardContent className="pt-4">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Tienda</TableHead><TableHead>A Pagar</TableHead><TableHead className="text-right">Acción Manual</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {storeDebts.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center">Al día.</TableCell></TableRow> : 
                                            storeDebts.map((debt, i) => (
                                                <TableRow key={i}>
                                                    <TableCell>{debt.name}</TableCell>
                                                    <TableCell className="font-bold text-blue-600">${debt.total.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" variant="secondary" disabled={!!isProcessing} onClick={() => handleManualPayout('store', debt.name, debt.ids, debt.total, debt.ownerId)}>
                                                            Marcar Pagado
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        }
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="drivers">
                        <Card>
                            <CardContent className="pt-4">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Repartidor</TableHead><TableHead>A Pagar</TableHead><TableHead className="text-right">Acción Manual</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {driverDebts.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center">Al día.</TableCell></TableRow> : 
                                            driverDebts.map((debt, i) => (
                                                <TableRow key={i}>
                                                    <TableCell>{debt.name}</TableCell>
                                                    <TableCell className="font-bold text-orange-600">${debt.total.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" variant="secondary" disabled={!!isProcessing} onClick={() => handleManualPayout('delivery', debt.name, debt.ids, debt.total, debt.driverId)}>
                                                            Marcar Pagado
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        }
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}