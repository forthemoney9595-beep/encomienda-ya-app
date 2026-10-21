'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-context';
import { authedFetch } from '@/lib/authed-fetch';
import { money } from '@/lib/format-money';
import { useToast } from '@/hooks/use-toast';
import type { Claim } from '@/lib/claim-types';

export interface RefundDialogOrder {
  id: string;
  customerName?: string;
  storeName?: string;
  total?: number;
}

export interface RefundDialogProps {
  order: RefundDialogOrder | null;
  claim?: Pick<Claim, 'id' | 'suggestedAmount' | 'type'> | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

/**
 * Diálogo ÚNICO de reembolso (antes duplicado en /admin/orders y /admin/claims). Precarga el
 * monto sugerido del reclamo si hay; comprobante obligatorio (≥ 4); el texto fijo recuerda el
 * orden correcto: PRIMERO devolvés en MercadoPago, DESPUÉS lo registrás acá. La API
 * (/api/admin/refund-order) exige admin 'full', audita en server y resuelve el reclamo.
 * Principio del producto: el dinero nunca sale solo — esto solo REGISTRA lo que el admin ya
 * devolvió a mano.
 */
export function RefundDialog({ order, claim, onOpenChange, onDone }: RefundDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [operationRef, setOperationRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!order) return;
    const suggested = claim?.suggestedAmount ?? order.total ?? '';
    setAmount(String(suggested));
    setReason('');
    setOperationRef('');
  }, [order, claim]);

  const numAmount = Number(amount);
  const amountOk = Number.isFinite(numAmount) && numAmount > 0 && (!order?.total || numAmount <= order.total);
  const opOk = operationRef.trim().length >= 4;

  const submit = async () => {
    if (!user || !order || !amountOk || !opOk) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/admin/refund-order', user, {
        orderId: order.id, amount: numAmount, reason: reason.trim(), operationRef: operationRef.trim(),
        ...(claim?.id ? { claimId: claim.id } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      toast({ title: 'Reembolso registrado', description: `${money(numAmount)} devueltos al comprador.` });
      onOpenChange(false);
      onDone?.();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error al reembolsar', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md" data-testid="refund-dialog">
        <DialogHeader><DialogTitle>Registrar reembolso</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="text-sm text-muted-foreground">
            Pedido <span className="font-mono text-foreground">#{order?.id.slice(0, 7)}</span> de <strong className="text-foreground">{order?.customerName || 'cliente'}</strong>
            {order?.storeName ? <> en <strong className="text-foreground">{order.storeName}</strong></> : null} · Total {money(order?.total)}
            {claim ? <> · desde el reclamo{claim.suggestedAmount ? ` (sugerido ${money(claim.suggestedAmount)})` : ''}</> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Monto a reembolsar *</Label>
            <Input id="refund-amount" type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={amount !== '' && !amountOk ? true : undefined} />
            {amount !== '' && !amountOk && <p className="text-xs text-destructive-ink">Tiene que ser mayor a 0 y no superar el total del pedido.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Motivo <span className="text-muted-foreground">(lo verá el comprador)</span></Label>
            <Textarea id="refund-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: El pedido llegó incompleto." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-op">N° de operación de la devolución *</Label>
            <Input id="refund-op" value={operationRef} onChange={e => setOperationRef(e.target.value)} placeholder="El que te da MercadoPago al devolver" autoComplete="off" />
          </div>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
            <strong>Primero devolvés en MercadoPago, después lo registrás acá.</strong> Esto no mueve plata: descuenta el monto del saldo de la tienda y del repartidor, y le avisa al comprador que ya se le devolvió.
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={submitting || !amountOk || !opOk} className="gap-1.5">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Ya devolví — registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
