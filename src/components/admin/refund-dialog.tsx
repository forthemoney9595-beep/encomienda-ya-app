'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { authedFetch } from '@/lib/authed-fetch';
import { money } from '@/lib/format-money';
import { useToast } from '@/hooks/use-toast';
import {
  FALLBACK_COMMISSION, isPlatformCollected, refundAllocationCaps, suggestRefundAllocation, validateRefundAllocation,
  type MoneyOrder, type RefundAllocation, type RefundPreset,
} from '@/lib/money';
import { suggestedRefundPreset, CLAIM_RISK_LABELS, type Claim, type ClaimRiskSignal } from '@/lib/claim-types';
import { cn } from '@/lib/utils';

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

type FullOrder = MoneyOrder & { status?: string; storeId?: string; deliveryPersonId?: string | null; deliveryPinVerified?: boolean };

const PRESET_OPTIONS: { value: RefundPreset; label: string; hint: string }[] = [
  { value: 'proportional', label: 'Proporcional', hint: 'como hasta hoy' },
  { value: 'store', label: 'La tienda', hint: 'faltó, mal estado, otro producto' },
  { value: 'driver', label: 'El repartidor', hint: 'lo perdió o lo dañó en el viaje' },
  { value: 'platform', label: 'La plataforma', hint: 'error nuestro o sin culpable' },
  { value: 'custom', label: 'Personalizado', hint: 'tres montos a mano' },
];
const PARTY_LABEL: Record<keyof RefundAllocation, string> = { store: 'Tienda', driver: 'Repartidor', platform: 'Plataforma' };

/**
 * Diálogo ÚNICO de reembolso (lo usan /admin/orders, la ficha del pedido, /admin/claims y la
 * Conciliación MP). Precarga el monto sugerido del reclamo si hay; comprobante obligatorio
 * (≥ 4); el texto fijo recuerda el orden correcto: PRIMERO devolvés en MercadoPago, DESPUÉS
 * lo registrás acá.
 *
 * Fase YY bis: "¿Quién absorbe este reembolso?" — presets + personalizado, con el reparto
 * resultante a la vista ANTES de confirmar. La sugerencia sale del tipo de reclamo
 * (`CLAIM_REFUND_ABSORBER`), pero el admin siempre elige (principio "el dinero nunca sale
 * solo"). La validación es la MISMA función pura que usa la ruta (`validateRefundAllocation`).
 */
export function RefundDialog({ order, claim, onOpenChange, onDone }: RefundDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [operationRef, setOperationRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [preset, setPreset] = useState<RefundPreset>('proportional');
  const [custom, setCustom] = useState<Record<keyof RefundAllocation, string>>({ store: '', driver: '', platform: '' });
  const [full, setFull] = useState<FullOrder | null>(null);
  const [rate, setRate] = useState(FALLBACK_COMMISSION);
  const [risk, setRisk] = useState<ClaimRiskSignal[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);

  const suggested = suggestedRefundPreset(claim?.type);

  useEffect(() => {
    if (!order) return;
    setAmount(String(claim?.suggestedAmount ?? order.total ?? ''));
    setReason('');
    setOperationRef('');
    setPreset(suggestedRefundPreset(claim?.type));
    setCustom({ store: '', driver: '', platform: '' });
    setFull(null);
    setRisk([]);
    // El diálogo necesita el pedido COMPLETO (subtotal, envío, tarifa, comisión congelada,
    // estado, repartidor) para calcular los topes de cada parte: 1-3 lecturas al abrir.
    let cancelled = false;
    setLoadingOrder(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', order.id));
        const o = (snap.exists() ? snap.data() : {}) as FullOrder;
        const [storeSnap, cfgSnap, riskSnap] = await Promise.all([
          o.storeId ? getDoc(doc(db, 'stores', o.storeId)).catch(() => null) : Promise.resolve(null),
          getDoc(doc(db, 'config', 'platform')).catch(() => null),
          claim?.id ? getDoc(doc(db, 'claim_risk', claim.id)).catch(() => null) : Promise.resolve(null),
        ]);
        // Comisión por defecto: mismo criterio que computeStoreBalance y la ruta.
        const storeRate = storeSnap?.data()?.commissionRate;
        const def = cfgSnap?.data()?.defaultCommissionRate;
        const r = typeof storeRate === 'number' && storeRate > 0 ? storeRate : (typeof def === 'number' && def >= 0 ? def : FALLBACK_COMMISSION);
        const signals = (riskSnap?.data()?.signals as ClaimRiskSignal[] | undefined) ?? [];
        // Reclamos anteriores a claim_risk: la señal del PIN se deduce del propio pedido.
        if (claim?.type === 'not_received' && o.deliveryPinVerified === true && !signals.some(s => s.code === 'pin_verified_not_received')) {
          signals.unshift({ code: 'pin_verified_not_received', label: CLAIM_RISK_LABELS.pin_verified_not_received });
        }
        if (!cancelled) { setFull(o); setRate(r); setRisk(signals); }
      } catch {
        if (!cancelled) setFull({});
      } finally {
        if (!cancelled) setLoadingOrder(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order, claim]);

  const numAmount = Number(amount);
  const amountOk = Number.isFinite(numAmount) && numAmount > 0 && (!order?.total || numAmount <= order.total);
  const opOk = operationRef.trim().length >= 4;

  // ¿Corresponde asignar? Solo en pedidos ENTREGADOS y cobrados por la plataforma: antes de
  // entregar nadie cobró nada, el reembolso sale entero de lo que retuvo la plataforma.
  const assignable = !!full && full.status === 'Entregado' && isPlatformCollected(full);
  const caps = useMemo(() => (full ? refundAllocationCaps(full, rate) : null), [full, rate]);
  const noDriver = !full?.deliveryPersonId;

  const proposal = useMemo((): { allocation: RefundAllocation | null; overflow: number; error: string | null } => {
    if (!assignable || !full || !amountOk) return { allocation: null, overflow: 0, error: null };
    if (preset === 'custom') {
      const a = { store: Number(custom.store) || 0, driver: Number(custom.driver) || 0, platform: Number(custom.platform) || 0 };
      const v = validateRefundAllocation(full, rate, numAmount, a);
      return v.ok ? { allocation: v.allocation, overflow: 0, error: null } : { allocation: null, overflow: 0, error: v.error };
    }
    const s = suggestRefundAllocation(full, rate, numAmount, preset);
    const v = validateRefundAllocation(full, rate, numAmount, s.allocation);
    return v.ok ? { allocation: v.allocation, overflow: s.overflow, error: null } : { allocation: null, overflow: 0, error: v.error };
  }, [assignable, full, amountOk, preset, custom, rate, numAmount]);

  const driverProblem = !!proposal.allocation && proposal.allocation.driver > 0 && noDriver;
  const allocationOk = !assignable || (!!proposal.allocation && !driverProblem);

  const submit = async () => {
    if (!user || !order || !amountOk || !opOk || !allocationOk) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/admin/refund-order', user, {
        orderId: order.id, amount: numAmount, reason: reason.trim(), operationRef: operationRef.trim(),
        ...(claim?.id ? { claimId: claim.id } : {}),
        ...(assignable && proposal.allocation ? { allocation: proposal.allocation, allocationPreset: preset } : {}),
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

  const pinWarning = risk.find(s => s.code === 'pin_verified_not_received');
  const otherRisk = risk.filter(s => s.code !== 'pin_verified_not_received');

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      {/* data-surface: el Dialog se porta a <body>, fuera del shell admin — sin esto los tokens -ink no existen. */}
      <DialogContent data-surface="admin" className="max-h-[92vh] overflow-y-auto sm:max-w-lg" data-testid="refund-dialog">
        <DialogHeader><DialogTitle>Registrar reembolso</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="text-sm text-muted-foreground">
            Pedido <span className="font-mono text-foreground">#{order?.id.slice(0, 7)}</span> de <strong className="text-foreground">{order?.customerName || 'cliente'}</strong>
            {order?.storeName ? <> en <strong className="text-foreground">{order.storeName}</strong></> : null} · Total {money(order?.total)}
            {claim ? <> · desde el reclamo{claim.suggestedAmount ? ` (sugerido ${money(claim.suggestedAmount)})` : ''}</> : null}
          </div>

          {pinWarning && (
            <div role="alert" className="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-sm" data-testid="refund-pin-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-ink" aria-hidden="true" />
              <div>
                <strong className="text-destructive-ink">Ojo: el comprador dice que no le llegó, pero la entrega se confirmó con su PIN.</strong>{' '}
                El repartidor ingresó el código que solo tenía el comprador. Revisá el chat y el historial antes de reembolsar.
              </div>
            </div>
          )}
          {otherRisk.length > 0 && (
            <p className="text-xs text-warning-ink" data-testid="refund-risk">Señales de riesgo: {otherRisk.map(s => s.label).join(' · ')}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Monto a reembolsar *</Label>
            <Input id="refund-amount" type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={amount !== '' && !amountOk ? true : undefined} />
            {amount !== '' && !amountOk && <p className="text-xs text-destructive-ink">Tiene que ser mayor a 0 y no superar el total del pedido.</p>}
          </div>

          {/* ── Quién absorbe ── */}
          <fieldset className="space-y-2" data-testid="refund-absorber">
            <legend className="text-sm font-medium">¿Quién absorbe este reembolso?</legend>
            {loadingOrder && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Calculando lo que cobra cada parte…</p>}
            {!loadingOrder && full && !assignable && (
              <p className="rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground" data-testid="refund-not-assignable">
                {full.status !== 'Entregado'
                  ? 'Este pedido no se entregó: la tienda y el repartidor no cobraron nada de él. El reembolso sale de lo que cobró la plataforma.'
                  : 'Pedido en efectivo: la plataforma no cobró nada que repartir.'}
              </p>
            )}
            {!loadingOrder && assignable && (
              <>
                <div role="radiogroup" aria-label="Quién absorbe el reembolso" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PRESET_OPTIONS.map(opt => {
                    const active = preset === opt.value;
                    return (
                      <button key={opt.value} type="button" role="radio" aria-checked={active} data-preset={opt.value}
                        onClick={() => {
                          setPreset(opt.value);
                          if (opt.value === 'custom' && proposal.allocation) {
                            setCustom({ store: String(proposal.allocation.store), driver: String(proposal.allocation.driver), platform: String(proposal.allocation.platform) });
                          }
                        }}
                        className={cn('min-h-[44px] rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
                          active ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-muted/60')}>
                        <span className="flex items-center gap-1.5 font-medium">
                          {opt.label}
                          {opt.value === suggested && <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary-ink">sugerido</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>

                {preset === 'custom' && caps && (
                  <div className="grid grid-cols-3 gap-2">
                    {(['store', 'driver', 'platform'] as const).map(p => (
                      <div key={p} className="space-y-1">
                        <Label htmlFor={`refund-custom-${p}`} className="text-xs">{PARTY_LABEL[p]}</Label>
                        <Input id={`refund-custom-${p}`} type="number" inputMode="decimal" value={custom[p]}
                          onChange={e => setCustom(c => ({ ...c, [p]: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">máx {money(caps[p])}</p>
                      </div>
                    ))}
                  </div>
                )}

                {proposal.error && <p className="text-xs text-destructive-ink" data-testid="refund-allocation-error">{proposal.error}</p>}
                {driverProblem && <p className="text-xs text-destructive-ink">Este pedido no tiene repartidor asignado: no puede absorber nada.</p>}

                {proposal.allocation && caps && (
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 text-sm" data-testid="refund-split">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reparto resultante</p>
                    <dl className="space-y-1">
                      {(['store', 'driver', 'platform'] as const).map(p => (
                        <div key={p} className="flex items-baseline justify-between gap-2" data-testid={`refund-split-${p}`}>
                          <dt className="text-muted-foreground">{PARTY_LABEL[p]}</dt>
                          <dd className="tabular-nums">
                            <span className={proposal.allocation![p] > 0 ? 'font-semibold text-destructive-ink' : 'text-muted-foreground'}>− {money(proposal.allocation![p])}</span>
                            <span className="text-xs text-muted-foreground"> · le queda {money(caps[p] - proposal.allocation![p])} de {money(caps[p])}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {proposal.overflow > 0 && preset !== 'proportional' && (
                      <p className="mt-1.5 text-xs text-warning-ink" data-testid="refund-overflow">
                        {PARTY_LABEL[preset as keyof RefundAllocation]} solo puede absorber {money(caps[preset as keyof RefundAllocation])} de este pedido: el excedente ({money(proposal.overflow)}) lo absorbe {preset === 'platform' ? 'el resto, en proporción' : 'la plataforma'}{preset !== 'platform' && proposal.overflow > caps.platform ? ' y, lo que no alcanza, el resto' : ''}.
                      </p>
                    )}
                    {(proposal.allocation.store > 0 || proposal.allocation.driver > 0) && (
                      <p className="mt-1.5 text-xs text-muted-foreground">Se les avisa a {[proposal.allocation.store > 0 && 'la tienda', proposal.allocation.driver > 0 && 'el repartidor'].filter(Boolean).join(' y ')} con el monto y el motivo.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Motivo <span className="text-muted-foreground">(lo verá el comprador{assignable && proposal.allocation && (proposal.allocation.store > 0 || proposal.allocation.driver > 0) ? ' y quien lo absorbe' : ''})</span></Label>
            <Textarea id="refund-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: El pedido llegó incompleto." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-op">N° de operación de la devolución *</Label>
            <Input id="refund-op" value={operationRef} onChange={e => setOperationRef(e.target.value)} placeholder="El que te da MercadoPago al devolver" autoComplete="off" />
          </div>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
            <strong>Primero devolvés en MercadoPago, después lo registrás acá.</strong> Esto no mueve plata: descuenta el monto del saldo de quien lo absorbe, según el reparto de arriba, y le avisa al comprador que ya se le devolvió.
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={submitting || loadingOrder || !amountOk || !opOk || !allocationOk} className="gap-1.5" data-testid="refund-submit">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Ya devolví — registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
