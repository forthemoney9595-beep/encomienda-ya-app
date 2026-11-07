'use client';

import { useState } from 'react';
import { collection, limit, orderBy, query, where, type Query } from 'firebase/firestore';
import { Gavel, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { User } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { db, useCollection, useMemoFirebase } from '@/lib/firebase';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { fmtDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import {
  describeSuspensionEnd, reasonLabelOf, APPEAL_RESPONSE_MIN, type AccountSuspension,
} from '@/lib/suspension';
import { useConfirm } from './confirm-dialog';
import { useAdminCounts } from './use-admin-counts';

export interface AppealDoc {
  id: string;
  uid: string;
  role?: string;
  accountName?: string;
  text?: string;
  status?: 'open' | 'reactivated' | 'maintained';
  resolved?: boolean;
  response?: string;
  createdAt?: unknown;
  resolvedAt?: unknown;
  suspensionReason?: string;
  suspensionDetail?: string;
}

/**
 * Resolver una apelación desde cualquier pantalla del admin (ficha o Bandeja): el mismo
 * diálogo y la misma ruta. Reactivar pide respuesta opcional; mantener, obligatoria.
 */
export function useAppealActions() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { toast } = useToast();
  const counts = useAdminCounts();

  const resolve = async (appeal: Pick<AppealDoc, 'id' | 'accountName' | 'text'>, decision: 'reactivate' | 'maintain'): Promise<boolean> => {
    if (!user) return false;
    const name = appeal.accountName || 'la cuenta';
    const { ok } = await confirm({
      title: decision === 'reactivate' ? `¿Reactivar a ${name}?` : `¿Mantener la suspensión de ${name}?`,
      description: (
        <span className="block space-y-2">
          {appeal.text && <span className="block rounded-md border bg-muted/40 p-2 text-sm italic">“{appeal.text}”</span>}
          <span className="block">
            {decision === 'reactivate'
              ? 'Se levanta la suspensión ahora: la cuenta vuelve a operar y la persona recibe tu respuesta.'
              : 'La suspensión sigue igual y la persona recibe tu respuesta por escrito. No puede volver a apelar esta suspensión.'}
          </span>
        </span>
      ),
      tone: decision === 'reactivate' ? 'default' : 'destructive',
      confirmLabel: decision === 'reactivate' ? 'Reactivar' : 'Mantener',
      fields: [{
        key: 'response', label: 'Respuesta a la persona', type: 'textarea',
        required: decision === 'maintain', min: decision === 'maintain' ? APPEAL_RESPONSE_MIN : undefined,
        placeholder: decision === 'reactivate' ? 'Opcional. Ej: revisamos el caso y fue un error del cliente.' : 'Por qué se mantiene. Ej: los reclamos están confirmados con fotos.',
      }],
      onConfirm: async (values) => {
        const res = await authedFetch('/api/admin/resolve-appeal', user, { appealId: appeal.id, decision, response: values.response || '' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo resolver la apelación.');
      },
    });
    if (ok) {
      toast({ title: decision === 'reactivate' ? 'Cuenta reactivada y avisada' : 'Suspensión mantenida, respuesta enviada' });
      void counts.refresh();
    }
    return ok;
  };

  return { resolve };
}

/** Levantar una suspensión a mano (sin apelación): nota obligatoria. */
export async function liftSuspensionWithConfirm(
  confirm: ReturnType<typeof useConfirm>, user: User, name: string, uid: string,
): Promise<boolean> {
  const { ok } = await confirm({
    title: `¿Levantar la suspensión de ${name}?`,
    description: 'La cuenta vuelve a operar ahora y la persona recibe tu nota.',
    confirmLabel: 'Levantar suspensión',
    fields: [{ key: 'note', label: 'Por qué se levanta', type: 'textarea', required: true, min: 10, placeholder: 'Ej: mandó el seguro vigente.' }],
    onConfirm: async (values) => {
      const res = await authedFetch('/api/admin/lift-suspension', user, { userId: uid, note: values.note });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo levantar la suspensión.');
    },
  });
  return ok;
}

/**
 * Bloque de la ficha de repartidor/tienda: suspensión vigente (motivo, detalle, hasta cuándo,
 * estado de la apelación) + historial de apelaciones de la cuenta + acciones. Si nunca tuvo
 * suspensión ni apelaciones, no ocupa lugar.
 */
export function SuspensionPanel({ uid, name, suspension }: { uid: string; name: string; suspension?: AccountSuspension | null }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { toast } = useToast();
  const counts = useAdminCounts();
  const { resolve } = useAppealActions();
  const [busy, setBusy] = useState(false);

  const appealsQ = useMemoFirebase<Query | null>(
    () => (uid ? query(collection(db, 'account_appeals'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(10)) : null),
    [uid],
  );
  const { data: appeals } = useCollection<AppealDoc>(appealsQ);

  const active = suspension?.active === true;
  if (!active && appeals.length === 0 && !suspension) return null;

  const openAppeal = appeals.find(a => a.resolved !== true);

  const lift = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const ok = await liftSuspensionWithConfirm(confirm, user, name, uid);
      if (ok) { toast({ title: 'Suspensión levantada y avisada' }); void counts.refresh(); }
    } finally { setBusy(false); }
  };

  return (
    <Card className={cn('shadow-sm', active && 'border-l-4 border-l-destructive')} data-testid="suspension-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {active ? <ShieldAlert className="h-4 w-4 text-destructive-ink" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4 text-success-ink" aria-hidden="true" />}
          {active ? 'Cuenta suspendida' : 'Suspensiones y apelaciones'}
        </CardTitle>
        {suspension && (
          <CardDescription>
            {active
              ? `Desde el ${fmtDate(suspension.at, 'long')} · ${describeSuspensionEnd(suspension.until ?? null)}`
              : `Última suspensión: ${fmtDate(suspension.at, 'date')}, levantada el ${fmtDate(suspension.liftedAt, 'date')}${suspension.liftCause === 'expired' ? ' (venció el plazo)' : suspension.liftCause === 'appeal' ? ' (apelación aceptada)' : ''}.`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {active && suspension && (
          <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
            <p><span className="font-medium">Motivo:</span> {reasonLabelOf(suspension.reason)}</p>
            <p className="text-muted-foreground">{suspension.detail}</p>
            <p className="text-xs text-muted-foreground">
              Apelación: {suspension.appealStatus === 'open' ? 'en revisión' : suspension.appealStatus === 'maintained' ? 'resuelta — se mantuvo' : 'todavía no apeló'}
            </p>
          </div>
        )}

        {openAppeal && (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3" data-testid="suspension-open-appeal">
            <p className="flex items-center gap-1.5 font-medium"><Gavel className="h-4 w-4 text-warning-ink" aria-hidden="true" /> Apelación en revisión · {fmtDate(openAppeal.createdAt, 'short')}</p>
            <p className="italic">“{openAppeal.text}”</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-9" onClick={() => resolve(openAppeal, 'maintain')}>Mantener</Button>
              <Button size="sm" className="h-9" onClick={() => resolve(openAppeal, 'reactivate')}>Reactivar</Button>
            </div>
          </div>
        )}

        {active && !openAppeal && (
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={lift} disabled={busy} data-testid="suspension-lift">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-success-ink" aria-hidden="true" />}
            Levantar suspensión
          </Button>
        )}

        {appeals.filter(a => a.resolved === true).length > 0 && (
          <div>
            <p className="text-xs font-medium">Apelaciones resueltas</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {appeals.filter(a => a.resolved === true).map(a => (
                <li key={a.id}>
                  · {fmtDate(a.createdAt, 'date')} — {a.status === 'reactivated' ? 'reactivada' : 'se mantuvo'}{a.response ? `: “${a.response}”` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
