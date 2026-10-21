'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { ExternalLink, MapPin, ShieldCheck, ShieldX, Undo2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db, useDoc, useMemoFirebase } from '@/lib/firebase';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import { reasonLabel, REASON_HINTS } from '@/lib/payment-issues';
import { CLAIM_TYPES, type Claim, type ClaimType } from '@/lib/claim-types';
import { commissionForOrder, driverNetForOrder, FALLBACK_COMMISSION, platformBreakdownForOrder, storeNetForOrder } from '@/lib/money';
import type { Order } from '@/lib/order-service';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPage } from '@/components/admin/admin-page';
import { StatusBadge } from '@/components/admin/status-badge';
import { EntityLink } from '@/components/admin/entity-link';
import { Timeline, type TimelineEvent } from '@/components/admin/timeline';
import { EmptyState } from '@/components/admin/empty-state';
import { ErrorState } from '@/components/admin/error-state';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { RefundDialog } from '@/components/admin/refund-dialog';
import { useAdminCounts } from '@/components/admin/use-admin-counts';
import { ChatWindow } from '@/app/orders/[orderId]/chat-window';

const CANCELABLE_BY_ADMIN = new Set(['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'Listo para recoger', 'En camino', 'En reparto']);

type OrderDoc = Order & Record<string, unknown> & {
  paymentStatus?: string; paidAt?: unknown; mpPaymentId?: string | number; cancelledAt?: unknown; cancelledBy?: string; cancelReason?: string;
  rejectedAt?: unknown; rejectedBy?: string; rejectionReason?: string; refundOperationRef?: string; refundedBy?: string;
  deliveryPinVerified?: boolean; adjustedItems?: Array<{ name?: string; from?: number; to?: number; quantity?: number; originalQuantity?: number }>;
  removedItems?: Array<{ name?: string; quantity?: number }>; commissionRate?: number; commissionAmount?: number; subtotal?: number;
  hasPaymentIssue?: boolean; paymentIssueReason?: string; simulatedPayment?: boolean; storeId: string; storeName: string;
};

function Section({ title, children, action, className }: { title: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-lg border border-border bg-card ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({ label, value, strong, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? 'border-t border-border pt-2 font-semibold' : ''}`}>
      <dt className="text-muted-foreground">{label}</dt><dd className={`tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

/**
 * Ficha ADMIN del pedido (NUEVA, Tanda T1). Antes el admin usaba /orders/[id] — la pantalla
 * del comprador — en otra pestaña. Acá: línea de tiempo, ítems con ajustes, dirección (de
 * order_private, que el admin ya puede leer), plata con el reparto de money.ts, reclamo,
 * discrepancias de pago, incidentes y chat solo lectura. ≈ 10 lecturas.
 */
export default function AdminOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ?? '';
  const { user, isAdmin, isFullAdmin } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const counts = useAdminCounts();

  const orderRef = useMemoFirebase(() => (isAdmin && orderId ? doc(db, 'orders', orderId) : null), [isAdmin, orderId]);
  const { data: order, isLoading, error } = useDoc<OrderDoc>(orderRef);
  const configRef = useMemoFirebase(() => (isAdmin ? doc(db, 'config', 'platform') : null), [isAdmin]);
  const { data: platformConfig } = useDoc<{ defaultCommissionRate?: number }>(configRef);
  const defaultCommission = typeof platformConfig?.defaultCommissionRate === 'number' ? platformConfig.defaultCommissionRate : FALLBACK_COMMISSION;

  // Lecturas one-shot relacionadas (se recargan al cambiar `tick`, tras una acción).
  const [tick, setTick] = useState(0);
  const [priv, setPriv] = useState<Record<string, unknown> | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [mismatches, setMismatches] = useState<Record<string, unknown>[]>([]);
  const [incidents, setIncidents] = useState<Record<string, unknown>[]>([]);
  const [refunds, setRefunds] = useState<Record<string, unknown>[]>([]);
  const [relatedError, setRelatedError] = useState<unknown>(null);
  const claimId = order?.claimId;
  useEffect(() => {
    if (!isAdmin || !orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, m, i, r, c] = await Promise.all([
          getDoc(doc(db, 'order_private', orderId)).catch(() => null),
          getDocs(query(collection(db, 'payment_mismatches'), where('orderId', '==', orderId), limit(10))),
          getDocs(query(collection(db, 'driver_incidents'), where('orderId', '==', orderId), limit(10))),
          getDocs(query(collection(db, 'refunds'), where('orderId', '==', orderId), limit(5))),
          claimId ? getDoc(doc(db, 'claims', claimId)) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPriv(p && p.exists() ? (p.data() as Record<string, unknown>) : null);
        setMismatches(m.docs.map(d => ({ id: d.id, ...d.data() })));
        setIncidents(i.docs.map(d => ({ id: d.id, ...d.data() })));
        setRefunds(r.docs.map(d => ({ id: d.id, ...d.data() })));
        setClaim(c && c.exists() ? ({ id: c.id, ...c.data() } as Claim) : null);
        setRelatedError(null);
      } catch (e) { if (!cancelled) setRelatedError(e); }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, orderId, claimId, tick]);

  // Pedido fusionado con la PII privada (solo lo que vive en order_private).
  const merged = useMemo<OrderDoc | null>(() => {
    if (!order) return null;
    const m: OrderDoc = { ...order };
    if (priv?.customerPhoneNumber != null) m.customerPhoneNumber = String(priv.customerPhoneNumber);
    if (priv?.shippingInfo != null) m.shippingInfo = priv.shippingInfo as Order['shippingInfo'];
    if (priv?.customerCoords != null) m.customerCoords = priv.customerCoords as Order['customerCoords'];
    return m;
  }, [order, priv]);

  const [refundOpen, setRefundOpen] = useState(false);

  const handleCancel = async () => {
    if (!user || !order) return;
    const { ok } = await confirm({
      title: `¿Cancelar el pedido #${order.id.slice(0, 7)}?`,
      description: <>Se avisa al comprador y a la tienda{order.deliveryPersonId ? ' y al repartidor' : ''}. Si estaba pagado, queda registrado como pasivo a devolver.</>,
      tone: 'destructive', confirmLabel: 'Cancelar pedido', cancelLabel: 'Volver',
      fields: [{ key: 'reason', label: 'Motivo (opcional, lo ven ambos)', type: 'textarea' }],
      onConfirm: async (v) => {
        const res = await authedFetch('/api/orders/cancel', user, { orderId: order.id, userId: order.userId, reason: v.reason });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        void logAdminAction(db, user.uid, 'cancel_order', order.id, v.reason || '');
      },
    });
    if (ok) { toast({ title: 'Pedido cancelado' }); setTick(t => t + 1); void counts.refresh(); }
  };

  if (!orderId) return null;
  if (error) return <AdminPage title="Pedido" crumbs={[{ label: 'Operación' }, { label: 'Pedidos', href: '/admin/orders' }, { label: 'Error' }]}><ErrorState error={error} /></AdminPage>;
  if (isLoading || !order) {
    return (
      <AdminPage title={<Skeleton className="h-8 w-48" />} crumbs={[{ label: 'Operación' }, { label: 'Pedidos', href: '/admin/orders' }, { label: `#${orderId.slice(0, 7)}` }]}>
        {!isLoading && !order ? <EmptyState title="Pedido no encontrado" description={<>No existe ningún pedido con el ID <span className="font-mono">{orderId}</span>.</>} /> : <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>}
      </AdminPage>
    );
  }

  const o = merged ?? order;
  const shortId = `#${o.id.slice(0, 7)}`;
  const isDelivered = o.status === 'Entregado';
  const rate = commissionForOrder(o, defaultCommission);
  const toStore = storeNetForOrder(o, defaultCommission);
  const toDriver = driverNetForOrder(o);
  const platform = platformBreakdownForOrder(o, defaultCommission);
  const cancelledBy = o.cancelledBy === 'admin' ? 'administración' : o.cancelledBy === 'buyer' ? 'el comprador' : o.cancelledBy;

  const events: TimelineEvent[] = [
    { key: 'created', at: o.createdAt, label: 'Pedido creado', detail: `${o.items?.length ?? 0} ítem${(o.items?.length ?? 0) === 1 ? '' : 's'} · ${money(o.total)}`, actor: o.customerName },
    { key: 'paid', at: o.paidAt ?? null, label: o.simulatedPayment ? 'Pago aprobado (🧪 simulado)' : 'Pago aprobado', detail: o.mpPaymentId ? `MercadoPago · pago ${String(o.mpPaymentId)}` : undefined, tone: 'success' },
    { key: 'taken', at: o.takenAt ?? null, label: 'Tomado por un repartidor', actor: o.deliveryPersonName ?? undefined, tone: 'info' },
    { key: 'picked', at: o.pickedUpAt ?? null, label: 'Retirado de la tienda', tone: 'info' },
    { key: 'delivered', at: o.deliveredAt ?? null, label: 'Entregado', tone: 'success',
      detail: o.deliveredAt ? (
        <span className="inline-flex items-center gap-1">{o.deliveryPinVerified ? <><ShieldCheck className="h-3.5 w-3.5 text-success-ink" aria-hidden="true" /> PIN de entrega verificado</> : <><ShieldX className="h-3.5 w-3.5 text-warning-ink" aria-hidden="true" /> sin PIN verificado</>}</span>
      ) : undefined },
  ];
  if (o.status === 'Cancelado' || o.cancelledAt) events.push({ key: 'cancelled', at: o.cancelledAt ?? o.updatedAt ?? null, label: 'Cancelado', detail: o.cancelReason || undefined, actor: cancelledBy, tone: 'destructive' });
  if (o.status === 'Rechazado' || o.rejectedAt) events.push({ key: 'rejected', at: o.rejectedAt ?? o.updatedAt ?? null, label: 'Rechazado por la tienda', detail: o.rejectionReason || undefined, tone: 'destructive' });
  if (o.refunded) events.push({ key: 'refunded', at: o.refundedAt ?? null, label: `Reembolso registrado · ${money(o.refundAmount)}`, detail: o.refundOperationRef ? `op. ${o.refundOperationRef}${o.refundReason ? ` · ${o.refundReason}` : ''}` : o.refundReason, tone: 'warning' });

  const address = o.shippingInfo?.address || (o as { shippingAddress?: { address?: string } }).shippingAddress?.address;

  return (
    <AdminPage
      title={<span className="flex flex-wrap items-center gap-2">Pedido <span className="font-mono">{shortId}</span> <StatusBadge kind="order" value={o.status} /> <StatusBadge kind="payment" value={o.paymentStatus} /></span>}
      subtitle={<>Creado {fmtDate(o.createdAt, 'long')} · total <strong className="text-foreground">{money(o.total)}</strong>{o.paymentMethod ? ` · ${o.paymentMethod}` : ''}</>}
      crumbs={[{ label: 'Operación' }, { label: 'Pedidos', href: '/admin/orders' }, { label: shortId }]}
      actions={
        <>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5"><Link href={`/orders/${o.id}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver como cliente</Link></Button>
          {isFullAdmin && o.paymentStatus === 'paid' && !o.refunded && (
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-warning-ink" onClick={() => setRefundOpen(true)}><Undo2 className="h-4 w-4" aria-hidden="true" /> Registrar reembolso</Button>
          )}
          {CANCELABLE_BY_ADMIN.has(o.status) && (
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-destructive-ink" onClick={handleCancel}><XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar pedido</Button>
          )}
        </>
      }
    >
      {/* Entidades */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">Cliente <EntityLink type="user" id={o.userId} label={o.customerName} quick /></span>
        <span className="text-muted-foreground">Tienda <EntityLink type="store" id={o.storeId} label={o.storeName} /></span>
        <span className="text-muted-foreground">Repartidor {o.deliveryPersonId ? <EntityLink type="driver" id={o.deliveryPersonId} label={o.deliveryPersonName || o.deliveryPersonId.slice(0, 8)} /> : <span className="text-foreground">sin asignar</span>}</span>
      </div>
      {relatedError ? <ErrorState compact error={relatedError} onRetry={() => setTick(t => t + 1)} /> : null}
      {o.hasPaymentIssue && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"><strong>Pago en revisión:</strong> {reasonLabel(o.paymentIssueReason)}. {REASON_HINTS[o.paymentIssueReason ?? ''] ?? ''} <Link href="/admin/payment-issues" className="font-medium text-primary-ink hover:underline">Conciliación MP →</Link></p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna izquierda */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Section title="Línea de tiempo"><Timeline events={events} /></Section>

          <Section title={`Ítems (${o.items?.length ?? 0})`}>
            <ul className="divide-y divide-border text-sm">
              {(o.items ?? []).map((it, i) => (
                <li key={`${it.id}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{it.quantity} × {it.name || (it as { title?: string }).title || 'ítem'}</span>
                  <span className="shrink-0 tabular-nums">{money((it.price ?? 0) * (it.quantity ?? 0))}</span>
                </li>
              ))}
            </ul>
            {((o.adjustedItems?.length ?? 0) > 0 || (o.removedItems?.length ?? 0) > 0) && (
              <div className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs">
                <strong className="text-warning-ink">Ajustes de la tienda al confirmar stock:</strong>
                <ul className="mt-1 list-inside list-disc">
                  {(o.removedItems ?? []).map((r, i) => <li key={`r${i}`}>quitó {r.name}{r.quantity ? ` (×${r.quantity})` : ''}</li>)}
                  {(o.adjustedItems ?? []).map((a, i) => <li key={`a${i}`}>{a.name}: {a.from ?? a.originalQuantity} → {a.to ?? a.quantity}</li>)}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Entrega">
            <dl className="space-y-1.5 text-sm">
              <Row label={<span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Dirección</span>} value={address || <span className="text-muted-foreground">no disponible</span>} />
              <Row label="Teléfono del cliente" value={o.customerPhoneNumber || <span className="text-muted-foreground">—</span>} />
              <Row label="Distancia tienda → cliente" value={typeof o.deliveryDistanceM === 'number' ? `≈ ${(o.deliveryDistanceM / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km` : '—'} />
              {!priv && <p className="text-xs text-muted-foreground">Pedido anterior a la colección order_private: los datos de contacto vienen del propio documento.</p>}
            </dl>
          </Section>

          <div className="relative z-0 min-w-0"><ChatWindow order={o as Order} /></div>
        </div>

        {/* Columna derecha */}
        <div className="min-w-0 space-y-4">
          <Section title="Plata">
            <dl className="space-y-1.5">
              <Row label="Productos (subtotal)" value={money(o.subtotal)} />
              <Row label="Envío" value={money(o.deliveryFee)} />
              <Row label="Tarifa de servicio" value={money(o.serviceFee)} />
              <Row label="Total cobrado" value={money(o.total)} strong />
              <Row label={`Comisión congelada (${rate} %${typeof o.commissionRate !== 'number' ? ', default' : ''})`} value={money(o.commissionAmount ?? (o.subtotal ?? 0) * rate / 100)} />
              {o.refunded && <Row label="Reembolsado" value={`− ${money(o.refundAmount)}`} tone="text-destructive-ink" />}
            </dl>
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reparto{isDelivered ? '' : ' (si se entrega)'}</p>
              <dl className="space-y-1.5">
                <Row label="A la tienda" value={money(toStore)} tone="text-foreground" />
                <Row label="Al repartidor" value={money(toDriver)} tone="text-info-ink" />
                <Row label="A la plataforma" value={money(platform.total)} tone="text-success-ink" />
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Mismas fórmulas que aprueban los retiros (money.ts): netas de reembolsos y 0 si fue en efectivo.{isDelivered ? '' : ' Se liquida recién al entregar.'}</p>
            </div>
          </Section>

          <Section title="Reclamo">
            {claim ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{CLAIM_TYPES[claim.type as ClaimType]?.label || claim.type}</span><StatusBadge kind="claim" value={claim.type} resolved={claim.resolved} resolution={claim.resolution} /></div>
                <p className="text-muted-foreground">{claim.description}</p>
                {claim.suggestedAmount ? <Row label="Monto sugerido" value={money(claim.suggestedAmount)} /> : null}
                <Row label="Antifraude" value={`${claim.previousClaims ?? 0} previos · ${claim.previousRefunded ?? 0} reembolsados`} />
                {claim.resolutionNote && <p className="rounded-md bg-muted px-2 py-1.5 text-xs">{claim.resolutionNote}</p>}
                <Link href="/admin/claims" className="inline-flex min-h-[36px] items-center text-sm font-medium text-primary-ink hover:underline">Gestionar en Reclamos →</Link>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sin reclamo del comprador.</p>}
          </Section>

          <Section title={`Discrepancias de pago (${mismatches.length})`}>
            {mismatches.length === 0 ? <p className="text-sm text-muted-foreground">Ninguna.</p> : (
              <ul className="space-y-2 text-sm">
                {mismatches.map(m => (
                  <li key={String(m.id)} className="flex items-start justify-between gap-2">
                    <div><div className="font-medium">{reasonLabel(String(m.reason ?? ''))}</div><div className="text-xs text-muted-foreground">{fmtDate(m.createdAt, 'long')}{m.paidAmount ? ` · pagó ${money(Number(m.paidAmount))}` : ''}</div></div>
                    <StatusBadge kind="mismatch" value={String(m.reason ?? '')} resolved={m.resolved === true} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Incidentes de reparto (${incidents.length})`}>
            {incidents.length === 0 ? <p className="text-sm text-muted-foreground">Ninguno.</p> : (
              <ul className="space-y-2 text-sm">
                {incidents.map(i => (
                  <li key={String(i.id)} className="flex items-start justify-between gap-2">
                    <div><div className="font-medium">{String(i.driverName ?? 'Repartidor')}</div><div className="text-xs text-muted-foreground">{String(i.reason ?? '')} · {fmtDate(i.createdAt, 'long')}</div></div>
                    <StatusBadge kind="incident" value={String(i.type ?? '')} resolved={i.resolved === true} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {refunds.length > 0 && (
            <Section title="Reembolsos registrados">
              <ul className="space-y-2 text-sm">
                {refunds.map(r => (
                  <li key={String(r.id)}><div className="flex justify-between"><span>{money(Number(r.amount))}</span><span className="text-xs text-muted-foreground">{fmtDate(r.createdAt, 'long')}</span></div><div className="text-xs text-muted-foreground">op. {String(r.operationRef ?? '—')}{r.reason ? ` · ${String(r.reason)}` : ''}</div></li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <RefundDialog order={refundOpen ? { id: o.id, customerName: o.customerName, storeName: o.storeName, total: o.total } : null} claim={claim && !claim.resolved ? claim : null}
        onOpenChange={(open) => { if (!open) setRefundOpen(false); }} onDone={() => { setTick(t => t + 1); void counts.refresh(); }} />
    </AdminPage>
  );
}
