'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, limit, orderBy, query, where, type Query } from 'firebase/firestore';
import { Gavel, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/auth-context';
import { db, useCollection, useMemoFirebase } from '@/lib/firebase';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { fmtDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import {
  APPEAL_TEXT_MIN, APPEAL_TEXT_MAX, canAppeal, describeSuspensionEnd, isSuspensionExpired, reasonLabelOf,
  suspensionMillis, validateAppealText,
} from '@/lib/suspension';

interface AppealRow { id: string; status?: string; resolved?: boolean; response?: string; createdAt?: unknown; text?: string }

// Tope de setTimeout (2^31 ms ≈ 24,8 días): una suspensión de 30 días se re-chequea a diario.
const MAX_TIMER_MS = 24 * 3_600_000;

/**
 * Aviso fijo "Tu cuenta está suspendida" del repartidor (/delivery, /orders) y de la tienda
 * (/my-store) — Fase YY ter, Tanda C. Muestra el motivo, el detalle y hasta cuándo, el estado
 * de la apelación y el botón "Apelar" (una vez por suspensión, POST /api/account/appeal).
 *
 * Reloj del fin de una suspensión temporal: al montarse y al llegar la hora de fin llama a
 * /api/account/suspension-check, que la levanta en el SERVIDOR si venció (decide su reloj, no
 * el del navegador). El perfil llega por el listener de auth-context, así que cuando el
 * servidor la levanta el aviso desaparece solo.
 */
export function SuspensionNotice({ className }: { className?: string }) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const s = userProfile?.suspension;
  const active = s?.active === true;
  const isStore = userProfile?.role === 'store';
  const uid = user?.uid ?? null;
  const untilMs = suspensionMillis(s?.until ?? null);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const checking = useRef(false);

  // Chequeo server-side al montarse y al llegar la hora de fin.
  useEffect(() => {
    if (!active || !user) return;
    let timer: number | undefined;
    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        await authedFetch('/api/account/suspension-check', user, {});
      } catch { /* el próximo montaje o el barrido diario lo reintentan */ }
      finally { checking.current = false; setNow(Date.now()); }
    };
    void check();
    if (untilMs !== null) {
      const wait = Math.min(Math.max(untilMs - Date.now() + 2_000, 2_000), MAX_TIMER_MS);
      timer = window.setTimeout(() => { void check(); }, wait);
    }
    return () => { if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uid, untilMs]);

  const appealsQ = useMemoFirebase<Query | null>(
    () => (active && uid ? query(collection(db, 'account_appeals'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(5)) : null),
    [active, uid],
  );
  const { data: appeals } = useCollection<AppealRow>(appealsQ);

  if (!active || !s) return null;
  const appeal = s.appealId ? appeals.find(a => a.id === s.appealId) : undefined;
  const expired = isSuspensionExpired(s, now);
  const allowedToAppeal = canAppeal(s, now);
  const len = text.trim().length;

  const send = async () => {
    if (!user || validateAppealText(text)) return;
    setSending(true); setError(null);
    try {
      const res = await authedFetch('/api/account/appeal', user, { text: text.trim() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la apelación.');
      toast({ title: 'Apelación enviada', description: 'Te vamos a responder por escrito.' });
      setOpen(false); setText('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  };

  return (
    // Rediseño en vidrio (9/11/2026): vidrio opaco con borde rojo y el ícono en un cuadradito
    // rojo suave. Mismas props, mismo texto y mismos data-testid (los usa _pw-tanda-c.js).
    <div className={cn('glass-strong rounded-card border-destructive/45 p-4 sm:p-5', className)} role="alert" data-testid="suspension-notice">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-headline text-xl font-extrabold leading-tight text-destructive">
            {isStore ? 'Tu tienda está suspendida' : 'Tu cuenta está suspendida'}
          </p>
          <p className="text-sm"><span className="font-medium">Motivo:</span> {reasonLabelOf(s.reason)}</p>
          <p className="text-sm text-muted-foreground break-words">{s.detail}</p>
          <p className="text-sm">
            {expired ? 'El plazo terminó: estamos reactivando tu cuenta…' : `${isStore ? 'No recibís pedidos nuevos' : 'No podés tomar pedidos nuevos'} ${describeSuspensionEnd(s.until ?? null)}.`}
          </p>
          <p className="text-sm text-muted-foreground">
            {isStore
              ? 'Los pedidos que ya estaban en curso siguen su camino. Lo que ganaste se te sigue debiendo: podés pedir el retiro desde tu billetera.'
              : 'Los pedidos que ya llevás los podés terminar. Lo que ganaste se te sigue debiendo: podés pedir el retiro desde tus ganancias.'}
          </p>

          {appeal && appeal.resolved !== true && (
            <p className="flex items-center gap-1.5 text-sm" data-testid="appeal-status">
              <Gavel className="h-4 w-4 text-warning" aria-hidden="true" />
              Apelaste el {fmtDate(appeal.createdAt, 'short')}. Está en revisión y te vamos a responder por escrito.
            </p>
          )}
          {(appeal?.status === 'maintained' || s.appealStatus === 'maintained') && (
            <div className="rounded-2xl bg-foreground/[0.05] p-3 text-sm" data-testid="appeal-status">
              <p className="font-medium">Revisamos tu apelación: la suspensión se mantiene.</p>
              {appeal?.response && <p className="text-muted-foreground">Respuesta: {appeal.response}</p>}
            </div>
          )}

          {allowedToAppeal && (
            <Button type="button" variant="outline" className="mt-2 h-11 gap-1.5 rounded-2xl bg-transparent px-5 text-base" onClick={() => { setError(null); setOpen(true); }} data-testid="appeal-open">
              <Gavel className="h-4 w-4" aria-hidden="true" /> Apelar
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!sending) setOpen(o); }}>
        <DialogContent className="w-[calc(100%-1.5rem)] rounded-card sm:max-w-md sm:rounded-card" data-testid="appeal-dialog">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl font-extrabold">Apelar la suspensión</DialogTitle>
            <DialogDescription>
              Contanos tu versión de lo que pasó. Podés apelar una sola vez por esta suspensión; la administración la revisa
              y te responde por escrito.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="appeal-text">Tu apelación</Label>
            <Textarea id="appeal-text" data-testid="appeal-text" rows={5} className="rounded-2xl text-base" maxLength={APPEAL_TEXT_MAX} value={text}
              onChange={(e) => setText(e.target.value)} aria-invalid={len > 0 && len < APPEAL_TEXT_MIN}
              placeholder="Ej: ese día el cliente no estaba en la dirección y lo esperé 20 minutos; tengo capturas del chat." />
            <p className={cn('text-xs', len > 0 && len < APPEAL_TEXT_MIN ? 'text-destructive' : 'text-muted-foreground')}>
              {len}/{APPEAL_TEXT_MIN} caracteres mínimos
            </p>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
            <Button type="button" className="h-12 rounded-2xl" onClick={send} disabled={!!validateAppealText(text) || sending} data-testid="appeal-send">
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar apelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ¿El perfil tiene una suspensión activa? (para esconder el aviso de "pendiente de aprobación"). */
export function useIsSuspended(): boolean {
  const { userProfile } = useAuth();
  return userProfile?.suspension?.active === true;
}
