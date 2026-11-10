'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { doc, updateDoc, deleteField, Timestamp, type DocumentData, type UpdateData } from 'firebase/firestore';
import { PauseCircle, Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { isStorePaused, pausedUntilMs } from '@/lib/store-hours';
import { fmtDate } from '@/lib/format-date';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Pausa con tiempo (Fase YY, punto 6): "pausar 30 min / 1 h / hasta que la reactive". Antes
// era un switch suelto y la gente se olvidaba la tienda pausada. Componente ÚNICO para los
// dos lugares donde el dueño pausa (`/my-store` y `/my-store/edit`): misma lección que R1,
// dos caminos que hacen lo mismo terminan desincronizados.
//
// Escribe `manuallyPaused` + `pausedUntil` (los dos están en el `hasOnly` del dueño en
// firestore.rules). La reactivación al vencer NO escribe nada: todos los lectores usan
// `isStorePaused()` y una pausa vencida ya cuenta como abierta.

const OPTIONS: { label: string; minutes: number | null }[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: 'Hasta que la reactive', minutes: null },
];

export function StorePauseControl({ storeId, activeDescription, variant = 'card' }: {
  storeId: string | undefined;
  activeDescription?: ReactNode;
  /** 'card' (default, /my-store/edit) o 'inset' (panel dentro del encabezado de /my-store). */
  variant?: 'card' | 'inset';
}) {
  const switchId = useId();
  const firestore = useFirestore();
  const { toast } = useToast();
  const storeRef = useMemoFirebase(() => (firestore && storeId ? doc(firestore, 'stores', storeId) : null), [firestore, storeId]);
  const { data: store } = useDoc<{ manuallyPaused?: boolean; pausedUntil?: unknown }>(storeRef);

  const [now, setNow] = useState(() => Date.now());
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const until = pausedUntilMs(store);
  const paused = isStorePaused(store, now);

  // Re-render justo al vencer la pausa: la tarjeta pasa sola a "Activa" sin recargar.
  useEffect(() => {
    if (!paused || until === null) return;
    const ms = Math.min(Math.max(until - Date.now() + 500, 0), 2_147_000_000);
    const id = window.setTimeout(() => setNow(Date.now()), ms);
    return () => window.clearTimeout(id);
  }, [paused, until]);

  const write = async (data: UpdateData<DocumentData>, ok: { title: string; description: string }) => {
    if (!storeRef) return;
    setBusy(true);
    try {
      await updateDoc(storeRef, data);
      setNow(Date.now());
      toast(ok);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar el estado de la tienda.' });
    } finally {
      setBusy(false);
      setChoosing(false);
    }
  };

  const pauseFor = (minutes: number | null) => {
    const untilTs = minutes === null ? null : Timestamp.fromMillis(Date.now() + minutes * 60_000);
    void write(
      { manuallyPaused: true, pausedUntil: untilTs ?? deleteField() },
      {
        title: 'Tienda pausada',
        description: untilTs
          ? `No te llegan pedidos nuevos hasta las ${fmtDate(untilTs.toMillis(), 'time')}. Después se reactiva sola.`
          : 'No vas a recibir pedidos nuevos hasta que la reactives.',
      },
    );
  };

  const reactivate = () => void write(
    { manuallyPaused: false, pausedUntil: deleteField() },
    { title: 'Tienda reactivada', description: 'Ya podés volver a recibir pedidos.' },
  );

  const statusText = paused
    ? (until !== null
        ? `Pausada hasta las ${fmtDate(until, 'time')}. Después vuelve a recibir pedidos sola.`
        : 'Pausada hasta que la reactives: no te llegan pedidos nuevos aunque estés en horario.')
    : (activeDescription ?? 'Si te quedaste sin stock o personal, pausá y no te van a llegar pedidos nuevos.');

  const statusPill = (
    // span (no Badge, que es un div): vive dentro de un <label>.
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', paused ? 'border-destructive/30 bg-destructive/15 text-destructive' : 'border-success/30 bg-success/15 text-success')}>
      {paused ? 'Pausada' : 'Activa'}
    </span>
  );

  const control = busy ? (
    <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" aria-label="Guardando" />
  ) : (
    <Switch
      id={switchId}
      aria-label={paused ? 'Reactivar la tienda' : 'Pausar la tienda'}
      // 'card': encendido = pausada (como siempre). 'inset' (encabezado de /my-store, modelo
      // Pizarra): encendido = RECIBIENDO pedidos, que es lo que dice el renglón. Mismo
      // aria-label y mismos handlers: solo cambia hacia qué lado se ve el interruptor.
      checked={variant === 'inset' ? !(paused || choosing) : (paused || choosing)}
      onCheckedChange={(on) => {
        const wantsPause = variant === 'inset' ? !on : on;
        if (wantsPause) setChoosing(true); else if (paused) reactivate(); else setChoosing(false);
      }}
      className="shrink-0"
    />
  );

  const options = choosing && !paused && (
    <div className="glass-strong animate-in fade-in-0 slide-in-from-top-1 rounded-2xl p-3 duration-200" data-testid="store-pause-options">
      <p className="mb-2 text-base font-semibold">¿Por cuánto tiempo pausás?</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(o => (
          <Button key={o.label} type="button" variant={o.minutes === 30 ? 'default' : 'outline'} className="h-11 rounded-full px-4 text-base" disabled={busy} onClick={() => pauseFor(o.minutes)}>
            {o.label}
          </Button>
        ))}
        <Button type="button" variant="ghost" className="h-11 rounded-full px-4 text-base" disabled={busy} onClick={() => setChoosing(false)}>
          Cancelar
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Con 30 min o 1 hora la tienda se reactiva sola, así no te la olvidás pausada.</p>
    </div>
  );

  // Variante "inset": panel dentro del encabezado del local en /my-store (modelo Pizarra).
  // Todo el renglón es la etiqueta del switch: el área tocable es la fila entera, no solo
  // el interruptor de 27 px.
  if (variant === 'inset') {
    return (
      <div
        data-testid="store-pause-card"
        className={cn(
          'space-y-3 rounded-2xl p-3 transition-colors',
          paused ? 'bg-destructive/10 ring-1 ring-destructive/30' : 'bg-foreground/[0.05]',
        )}
      >
        <div className="flex min-h-12 items-center justify-between gap-3">
          <label htmlFor={switchId} className="min-w-0 flex-1 cursor-pointer">
            <span className="flex flex-wrap items-center gap-2 text-base font-bold">
              {paused ? 'No estás recibiendo pedidos' : 'Recibiendo pedidos'} {statusPill}
            </span>
            <span className="block text-sm text-muted-foreground" data-testid="store-pause-status">{statusText}</span>
          </label>
          {control}
        </div>
        {options}
      </div>
    );
  }

  return (
    <Card className={paused ? 'border-destructive/40 bg-destructive/5' : ''} data-testid="store-pause-card">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={switchId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
            <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', paused ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary')}>
              <PauseCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                Estado de la tienda {statusPill}
              </span>
              <span className="block text-sm text-muted-foreground" data-testid="store-pause-status">{statusText}</span>
            </span>
          </label>
          {control}
        </div>
        {options}
      </CardContent>
    </Card>
  );
}
