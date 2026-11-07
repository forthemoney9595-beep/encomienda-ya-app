'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { doc, updateDoc, deleteField, Timestamp, type DocumentData, type UpdateData } from 'firebase/firestore';
import { PauseCircle, Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { isStorePaused, pausedUntilMs } from '@/lib/store-hours';
import { fmtDate } from '@/lib/format-date';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

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

export function StorePauseControl({ storeId, activeDescription }: { storeId: string | undefined; activeDescription?: ReactNode }) {
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

  return (
    <Card className={paused ? 'border-destructive/40 bg-destructive/5' : ''} data-testid="store-pause-card">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <PauseCircle className={`h-6 w-6 shrink-0 ${paused ? 'text-destructive' : 'text-muted-foreground'}`} aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                Estado de la tienda
                <Badge className={paused ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-success/15 text-success border-success/30'}>
                  {paused ? 'Pausada' : 'Activa'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="store-pause-status">
                {paused
                  ? (until !== null
                      ? `Pausada hasta las ${fmtDate(until, 'time')}. Después vuelve a recibir pedidos sola.`
                      : 'Pausada hasta que la reactives: no te llegan pedidos nuevos aunque estés en horario.')
                  : (activeDescription ?? 'Si te quedaste sin stock o personal, pausá y no te van a llegar pedidos nuevos.')}
              </p>
            </div>
          </div>
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Guardando" />
          ) : (
            <Switch
              aria-label={paused ? 'Reactivar la tienda' : 'Pausar la tienda'}
              checked={paused || choosing}
              onCheckedChange={(checked) => (checked ? setChoosing(true) : (paused ? reactivate() : setChoosing(false)))}
            />
          )}
        </div>

        {choosing && !paused && (
          <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="store-pause-options">
            <p className="mb-2 text-sm font-medium">¿Por cuánto tiempo pausás?</p>
            <div className="flex flex-wrap gap-2">
              {OPTIONS.map(o => (
                <Button key={o.label} type="button" size="sm" variant={o.minutes === 30 ? 'default' : 'outline'} className="h-9" disabled={busy} onClick={() => pauseFor(o.minutes)}>
                  {o.label}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => setChoosing(false)}>
                Cancelar
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Con 30 min o 1 hora la tienda se reactiva sola, así no te la olvidás pausada.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
