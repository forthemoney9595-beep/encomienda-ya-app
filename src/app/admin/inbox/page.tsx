'use client';

import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { logAdminAction } from '@/lib/admin-audit';
import { setAccountApproval } from '@/lib/approval-service';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AdminPage } from '@/components/admin/admin-page';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import { InboxList, type InboxItem, type InboxKind } from '@/components/admin/inbox-list';
import { useInboxItems, INBOX_SOURCE_LIMIT } from '@/components/admin/use-inbox';
import { useAdminCounts } from '@/components/admin/use-admin-counts';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { fmtElapsed } from '@/lib/format-date';

type ChipKey = 'all' | 'money' | 'claim' | 'incident' | 'approval' | 'stuck';
const CHIP_KINDS: Record<Exclude<ChipKey, 'all'>, InboxKind[]> = {
  money: ['mismatch', 'withdrawal'],
  claim: ['claim'],
  incident: ['incident'],
  approval: ['approval'],
  stuck: ['stuck'],
};

/**
 * Bandeja (NUEVA, Tanda T1): todo lo que espera una decisión humana, en una sola lista
 * ordenada por gravedad (plata → disputas → aprobaciones → informativo). Fuentes: listeners
 * sobre los sets ABIERTOS (`resolved == false`), no ventanas de 8/50 docs — un reclamo viejo
 * sin atender ya no desaparece en silencio. Los chips muestran el count() real.
 */
export default function AdminInboxPage() {
  const { user, isFullAdmin } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const counts = useAdminCounts();
  const inbox = useInboxItems();
  const [chip, setChip] = useState<ChipKey>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const moneyCount = (counts.counts.mismatchesOpen === null || (isFullAdmin && counts.counts.withdrawalsPending === null))
    ? null
    : (counts.counts.mismatchesOpen ?? 0) + (isFullAdmin ? (counts.counts.withdrawalsPending ?? 0) : 0);
  const approvalsCount = (counts.counts.pendingStores === null || counts.counts.pendingDrivers === null)
    ? null
    : (counts.counts.pendingStores ?? 0) + (counts.counts.pendingDrivers ?? 0);
  const totalCount = counts.inboxTotal === null ? null : counts.inboxTotal + inbox.stuckCount;

  const chips: FilterChip[] = [
    { value: 'all', label: 'Todo', count: totalCount },
    { value: 'money', label: 'Plata', count: moneyCount },
    { value: 'claim', label: 'Reclamos', count: counts.counts.claimsOpen },
    { value: 'incident', label: 'Incidentes', count: counts.counts.incidentsOpen },
    { value: 'approval', label: 'Aprobaciones', count: approvalsCount },
    { value: 'stuck', label: 'Trabados', count: inbox.loading ? null : inbox.stuckCount },
  ];

  const overflowSources = useMemo(() => {
    const out: string[] = [];
    const c = counts.counts;
    if ((c.claimsOpen ?? 0) > INBOX_SOURCE_LIMIT) out.push(`reclamos (${c.claimsOpen})`);
    if ((c.mismatchesOpen ?? 0) > INBOX_SOURCE_LIMIT) out.push(`discrepancias (${c.mismatchesOpen})`);
    if ((c.incidentsOpen ?? 0) > INBOX_SOURCE_LIMIT) out.push(`incidentes (${c.incidentsOpen})`);
    if (((c.pendingStores ?? 0) + (c.pendingDrivers ?? 0)) > INBOX_SOURCE_LIMIT) out.push('aprobaciones');
    if ((c.withdrawalsPending ?? 0) > INBOX_SOURCE_LIMIT) out.push(`retiros (${c.withdrawalsPending})`);
    return out;
  }, [counts.counts]);

  /* ── Acciones rápidas (sin salir de la Bandeja) ─────────────────────────── */
  const afterAction = async () => { await counts.refresh(); };

  const approve = async (item: InboxItem, approved: boolean) => {
    if (!user) return;
    const userId = String(item.meta?.userId ?? '');
    const role = String(item.meta?.role ?? '');
    const name = String(item.meta?.name ?? 'esta cuenta');
    const { ok } = await confirm({
      title: approved ? `¿Aprobar a ${name}?` : `¿Rechazar la solicitud de ${name}?`,
      description: approved
        ? (role === 'store' ? 'La tienda queda publicada y su dueño recibe el aviso.' : 'El repartidor queda habilitado para tomar pedidos y recibe el aviso.')
        : 'La persona recibe un aviso de que no se aprobó. Puede volver a escribir a soporte.',
      tone: approved ? 'default' : 'destructive',
      confirmLabel: approved ? 'Aprobar' : 'Rechazar',
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await setAccountApproval(db, { userId, approved, role, adminUser: user, label: role === 'store' ? 'tienda' : 'repartidor' });
      toast({ title: approved ? 'Cuenta aprobada y notificada' : 'Solicitud rechazada' });
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
      void afterAction();
    }
  };

  const resolve = async (item: InboxItem, collectionName: 'driver_incidents' | 'payment_mismatches') => {
    if (!user) return;
    const docId = String(item.meta?.docId ?? '');
    const isMoney = collectionName === 'payment_mismatches';
    const { ok, values } = await confirm({
      title: isMoney ? 'Marcar la discrepancia como resuelta' : 'Marcar el incidente como resuelto',
      description: isMoney
        ? 'Anotá QUÉ se hizo con esa plata (reembolso, ajuste, verificado en MP). Sin eso, dentro de seis meses nadie sabe cómo se cerró.'
        : 'Anotá cómo se resolvió (reasignado, cancelado, hablado con el repartidor).',
      confirmLabel: 'Marcar resuelto',
      fields: [{ key: 'note', label: 'Cómo se resolvió', type: 'textarea', required: true, min: 4, placeholder: isMoney ? 'Ej: verificado en MP, el pago entró completo' : 'Ej: se reasignó el pedido a otro repartidor' }],
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await updateDoc(doc(db, collectionName, docId), {
        resolved: true, resolvedAt: serverTimestamp(), resolvedBy: user.uid, resolutionNote: values.note,
      });
      void logAdminAction(db, user.uid, isMoney ? 'resolve_payment_mismatch' : 'resolve_driver_incident', docId, values.note);
      toast({ title: 'Marcado como resuelto' });
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'No se pudo marcar', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
      void afterAction();
    }
  };

  const items = useMemo<InboxItem[]>(() => {
    const kinds = chip === 'all' ? null : CHIP_KINDS[chip];
    return inbox.items
      .filter(it => !kinds || kinds.includes(it.kind))
      .map(it => {
        const busy = busyId === it.id;
        switch (it.kind) {
          case 'approval':
            return { ...it, actions: [
              { label: 'Rechazar', tone: 'destructive' as const, busy, onClick: () => approve(it, false) },
              { label: 'Aprobar', primary: true, busy, onClick: () => approve(it, true) },
            ] };
          case 'incident':
            return { ...it, actions: [
              { label: 'Ver pedido', href: it.href },
              { label: 'Resolver', primary: true, busy, onClick: () => resolve(it, 'driver_incidents') },
            ] };
          case 'mismatch':
            return { ...it, actions: [
              { label: 'Ver pedido', href: `/admin/orders/${String(it.meta?.orderId ?? '')}` },
              { label: 'Resolver', primary: true, busy, onClick: () => resolve(it, 'payment_mismatches') },
            ] };
          case 'withdrawal':
            return { ...it, actions: [{ label: 'Pagar', primary: true, href: '/admin/finances/payouts' }] };
          case 'claim':
            return { ...it, actions: [
              { label: 'Ver pedido', href: `/admin/orders/${String(it.meta?.orderId ?? '')}` },
              { label: 'Resolver', primary: true, href: '/admin/claims' },
            ] };
          case 'stuck':
            return { ...it, actions: [{ label: 'Ver pedido', primary: true, href: it.href }] };
          default:
            return it;
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.items, chip, busyId]);

  const oldest = inbox.items.reduce<number | null>((acc, it) => (it.since !== null && (acc === null || it.since < acc) ? it.since : acc), null);

  return (
    <AdminPage
      title="Bandeja"
      subtitle={
        <>
          Todo lo que espera una decisión tuya, ordenado por gravedad.
          {oldest !== null && <> Lo más viejo lleva <strong className="text-foreground">{fmtElapsed(inbox.now - oldest)}</strong> esperando.</>}
        </>
      }
      crumbs={[{ label: 'Hoy' }, { label: 'Bandeja' }]}
      live
      actions={
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void counts.refresh()} disabled={counts.loading}>
          <RefreshCw className={counts.loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" /> Refrescar conteos
        </Button>
      }
      filters={<FilterBar chips={chips} chipValue={chip} onChipChange={(v) => setChip(v as ChipKey)} />}
    >
      {overflowSources.length > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Hay más de {INBOX_SOURCE_LIMIT} abiertos en {overflowSources.join(', ')}: la lista muestra los {INBOX_SOURCE_LIMIT} más recientes de cada fuente. Filtrá por tipo o resolvé desde su pantalla.
        </p>
      )}
      <InboxList
        items={items}
        loading={inbox.loading}
        errors={inbox.errors}
        now={inbox.now}
        groupBy="severity"
        emptyTitle={chip === 'all' ? 'Nada pendiente. Todo al día.' : 'Nada pendiente en este tipo.'}
      />
    </AdminPage>
  );
}
