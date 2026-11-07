'use client';

import { useEffect, useState } from 'react';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { AlertTriangle, Loader2, ShieldAlert, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { fmtDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { CLAIM_TYPES, type ClaimType } from '@/lib/claim-types';
import {
  SUSPENSION_REASONS, SUSPENSION_REASON_CODES, SUSPENSION_DURATIONS, SUSPENSION_DETAIL_MIN, SUSPENSION_DETAIL_MAX,
  validateSuspensionInput, describeSuspensionEnd, suspensionUntilMs, type SuspensionReason, type SuspendableRole,
} from '@/lib/suspension';

export interface SuspendTarget {
  uid: string;
  role: SuspendableRole;
  name: string;
  storeId?: string | null;
}

interface History {
  rating: number;
  ratingCount: number;
  previousSuspensions: number;
  activeOrders: number | null;
  incidents: { id: string; type: string; reason: string; createdAt: unknown }[];
  claims: { id: string; type: string; resolved: boolean; createdAt: unknown }[];
}

const DRIVER_ACTIVE = ['En camino', 'En reparto'];
const STORE_ACTIVE = ['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'Listo para recoger', 'En camino', 'En reparto'];

/**
 * Diálogo ÚNICO para suspender una cuenta de repartidor o de tienda (Fase YY ter, Tanda C).
 * Lo usan todos los caminos que antes desactivaban/revocaban con un click (ficha y lista de
 * repartidores, ficha y diálogo de edición de tiendas — lección R1). Antes de confirmar
 * muestra lo que informa la decisión (rating, suspensiones previas, pedidos en curso,
 * incidentes o reclamos recientes) con consultas acotadas, y lo que va a leer la persona.
 * La suspensión la aplica el servidor (/api/admin/suspend-account).
 */
export function SuspendAccountDialog({ target, open, onOpenChange, onDone }: {
  target: SuspendTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState<SuspensionReason | ''>('');
  const [detail, setDetail] = useState('');
  const [durationDays, setDurationDays] = useState<number | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deps por valor (no por identidad): las páginas pasan `target` como objeto literal y un
  // re-render no debe borrar lo que el admin ya escribió.
  const tUid = target?.uid ?? null;
  const tRole = target?.role ?? null;
  const tStoreId = target?.storeId ?? null;
  useEffect(() => {
    if (!open || !tUid) return;
    const target = { uid: tUid, role: tRole, storeId: tStoreId };
    setReason(''); setDetail(''); setDurationDays(null); setError(null); setHistory(null); setHistoryError(null);
    let cancelled = false;
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', target.uid));
        const u = userSnap.data() ?? {};
        let rating = Number(u.rating) || 0;
        let ratingCount = Number(u.ratingCount) || 0;
        let activeOrders: number | null = null;
        let incidents: History['incidents'] = [];
        let claims: History['claims'] = [];
        if (target.role === 'delivery') {
          const [cnt, inc] = await Promise.all([
            getCountFromServer(query(collection(db, 'orders'), where('deliveryPersonId', '==', target.uid), where('status', 'in', DRIVER_ACTIVE))),
            // Sin orderBy (sin índice compuesto): set chico, se ordena en memoria.
            getDocs(query(collection(db, 'driver_incidents'), where('driverId', '==', target.uid), limit(20))),
          ]);
          activeOrders = cnt.data().count;
          incidents = inc.docs
            .map(d => ({ id: d.id, type: String(d.data().type || ''), reason: String(d.data().reason || ''), createdAt: d.data().createdAt }))
            .sort((a, b) => (toMs(b.createdAt) - toMs(a.createdAt)))
            .slice(0, 6);
        } else if (target.storeId) {
          const [storeSnap, cnt, cl] = await Promise.all([
            getDoc(doc(db, 'stores', target.storeId)),
            getCountFromServer(query(collection(db, 'orders'), where('storeId', '==', target.storeId), where('status', 'in', STORE_ACTIVE))),
            getDocs(query(collection(db, 'claims'), where('storeId', '==', target.storeId), orderBy('createdAt', 'desc'), limit(10))),
          ]);
          rating = Number(storeSnap.data()?.rating) || 0;
          ratingCount = Number(storeSnap.data()?.ratingCount) || 0;
          activeOrders = cnt.data().count;
          claims = cl.docs.map(d => ({ id: d.id, type: String(d.data().type || ''), resolved: d.data().resolved === true, createdAt: d.data().createdAt }));
        }
        if (!cancelled) setHistory({ rating, ratingCount, previousSuspensions: Number(u.suspensionCount) || 0, activeOrders, incidents, claims });
      } catch (e: unknown) {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [open, tUid, tRole, tStoreId]);

  if (!target) return null;
  const isStore = target.role === 'store';
  const invalid = validateSuspensionInput({ reason, detail, durationDays });
  const detailLen = detail.trim().length;
  const previewUntil = suspensionUntilMs(Date.now(), durationDays);

  const submit = async () => {
    if (invalid || !user) return;
    setSubmitting(true); setError(null);
    try {
      const res = await authedFetch('/api/admin/suspend-account', user, { userId: target.uid, reason, detail: detail.trim(), durationDays });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo suspender la cuenta.');
      toast({
        title: isStore ? 'Tienda suspendida' : 'Repartidor suspendido',
        description: `Se le avisó con el motivo ${describeSuspensionEnd(data.until ?? null)}.${!isStore && data.activeOrders ? ` Termina los ${data.activeOrders} pedido(s) que ya llevaba.` : ''}`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      {/* data-surface: el Dialog se porta a <body>, fuera del shell admin — sin esto los tokens -ink no existen. */}
      <DialogContent data-surface="admin" className="max-h-[92vh] overflow-y-auto sm:max-w-lg" data-testid="suspend-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive-ink" aria-hidden="true" />
            Suspender {isStore ? 'la tienda' : 'al repartidor'} {target.name}
          </DialogTitle>
          <DialogDescription>
            La persona recibe el motivo y el detalle por escrito, sabe hasta cuándo dura y puede apelar una vez. No se le
            descuenta plata: lo ganado se le sigue debiendo.
          </DialogDescription>
        </DialogHeader>

        {/* Lo que informa la decisión */}
        <section className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="suspend-history">
          <p className="font-medium">Antes de decidir</p>
          {historyError && <p className="text-destructive-ink">No se pudo cargar el historial: {historyError}</p>}
          {!history && !historyError && (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…</p>
          )}
          {history && (
            <>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                <li className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-warning-ink" aria-hidden="true" />
                  {history.ratingCount > 0 ? `${history.rating.toFixed(1)} (${history.ratingCount} reseñas)` : 'Sin reseñas'}
                </li>
                <li>{history.previousSuspensions === 0 ? 'Nunca fue suspendido' : `${history.previousSuspensions} suspensión(es) anteriores`}</li>
                <li className="col-span-2">
                  {isStore
                    ? `${history.activeOrders ?? 0} pedido(s) en curso`
                    : `${history.activeOrders ?? 0} pedido(s) que ya lleva`}
                </li>
              </ul>
              {(history.activeOrders ?? 0) > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" data-testid="suspend-active-orders">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
                  {isStore
                    ? 'La tienda deja de recibir pedidos nuevos, pero los que ya tiene en curso siguen su camino.'
                    : 'La suspensión NO le quita los pedidos que ya lleva (un pedido no se abandona en la calle): los termina y no puede tomar nuevos.'}
                </p>
              )}
              {!isStore && (
                <div>
                  <p className="text-xs font-medium">Incidentes recientes</p>
                  {history.incidents.length === 0
                    ? <p className="text-xs text-muted-foreground">Ninguno.</p>
                    : (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {history.incidents.map(i => (
                          <li key={i.id}>· {fmtDate(i.createdAt, 'date')} — {i.type === 'problem_reported' ? 'Problema reportado' : 'Soltó un pedido'}{i.reason ? `: ${i.reason}` : ''}</li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
              {isStore && (
                <div>
                  <p className="text-xs font-medium">Reclamos recientes sobre sus pedidos</p>
                  {history.claims.length === 0
                    ? <p className="text-xs text-muted-foreground">Ninguno.</p>
                    : (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {history.claims.map(c => (
                          <li key={c.id}>· {fmtDate(c.createdAt, 'date')} — {CLAIM_TYPES[c.type as ClaimType]?.label || c.type}{c.resolved ? '' : ' (abierto)'}</li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
            </>
          )}
        </section>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">Motivo</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as SuspensionReason)}>
              <SelectTrigger id="suspend-reason" data-testid="suspend-reason" aria-label="Motivo de la suspensión"><SelectValue placeholder="Elegí un motivo" /></SelectTrigger>
              <SelectContent>
                {SUSPENSION_REASON_CODES.map(code => (
                  <SelectItem key={code} value={code}>{SUSPENSION_REASONS[code].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason && <p className="text-xs text-muted-foreground">{SUSPENSION_REASONS[reason].hint}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="suspend-detail">Detalle (lo lee la persona)</Label>
            <Textarea
              id="suspend-detail" data-testid="suspend-detail" rows={4} maxLength={SUSPENSION_DETAIL_MAX}
              value={detail} onChange={(e) => setDetail(e.target.value)}
              placeholder="Qué pasó, cuándo, y qué tendría que hacer para volver. Ej: dos clientes reportaron trato agresivo los días 3 y 5/11."
              aria-invalid={detailLen > 0 && detailLen < SUSPENSION_DETAIL_MIN}
            />
            <p className={cn('text-xs', detailLen > 0 && detailLen < SUSPENSION_DETAIL_MIN ? 'text-destructive-ink' : 'text-muted-foreground')}>
              {detailLen}/{SUSPENSION_DETAIL_MIN} caracteres mínimos
            </p>
          </div>

          <div className="space-y-1.5">
            <Label id="suspend-duration-label">Duración</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="suspend-duration-label">
              {SUSPENSION_DURATIONS.map(d => (
                <button
                  key={String(d)} type="button" role="radio" aria-checked={durationDays === d}
                  data-testid={`suspend-duration-${d ?? 'review'}`}
                  onClick={() => setDurationDays(d)}
                  className={cn('h-9 rounded-full border px-3 text-sm transition-colors',
                    durationDays === d ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                >
                  {d === null ? 'Hasta revisión' : `${d} días`}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {durationDays === null
                ? 'Sigue suspendida hasta que un admin la levante o resuelva una apelación.'
                : `Se levanta sola ${describeSuspensionEnd(previewUntil)}.`}
            </p>
          </div>

          {!invalid && (
            <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs" data-testid="suspend-preview">
              <p className="font-medium text-info-ink">Lo que va a leer</p>
              <p className="mt-1">
                Motivo: {SUSPENSION_REASONS[reason as SuspensionReason].label}. {detail.trim()} {isStore ? 'Tu tienda no recibe pedidos nuevos' : 'No vas a poder tomar pedidos nuevos'} {describeSuspensionEnd(previewUntil)}. Podés apelar una vez y te respondemos por escrito.
              </p>
            </div>
          )}

          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive-ink" role="alert">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={!!invalid || submitting} data-testid="suspend-confirm">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Suspender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toMs(ts: unknown): number {
  const t = ts as { toMillis?: () => number } | null;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
}
