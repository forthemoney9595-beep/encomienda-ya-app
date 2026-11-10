'use client';

import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { Check, Loader2, Printer, SlidersHorizontal } from 'lucide-react';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import { playSound } from '@/lib/notify-sounds';
import { confirmStoreOrder } from '@/lib/store-confirm-order';
import { useConfirmTimeoutWatcher } from '@/hooks/use-confirm-timeout';
import { useToast } from '@/hooks/use-toast';
import { ConfirmCountdown } from '@/components/confirm-countdown';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import styles from './store-comanda.module.css';

// Comanda de /my-store (rediseño en vidrio, modelo A "Pizarra", 9/11/2026).
//
// Muestra los pedidos 'Pendiente de Confirmación' de la tienda como tickets de papel. Cuando
// entra uno que no estaba, se "imprime" (animación) y suena el aviso que eligió el usuario
// (`playSound()`, Perfil → Apariencia). En la carga inicial NO suena: el primer lote siembra
// el set de vistos, igual que la alerta del panel de pedidos.
//
// Los pedidos los recibe del dashboard (la MISMA consulta acotada que alimenta los contadores:
// storeId + estados en vivo). "Confirmar" usa `confirmStoreOrder`, la misma función que la
// pestaña Nuevos de /orders; "Ajustar o sacar productos" lleva ahí (checkboxes y −/+).

type ComandaItem = { id?: string; title?: string; name?: string; quantity?: number };
export type ComandaOrder = {
  id: string;
  status?: string;
  customerName?: string;
  total?: number;
  items?: ComandaItem[];
  createdAt?: { toMillis?: () => number; seconds?: number } | null;
};

const EXIT_MS = 520;

const createdMs = (o: ComandaOrder): number | null => {
  const c = o.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === 'function') return c.toMillis();
  return typeof c.seconds === 'number' ? c.seconds * 1000 : null;
};

/** Papel de ticket (fondo claro en los dos temas, dientes abajo). Lo reusa /orders. */
export function StoreTicketPaper({ printing, done, className, children, ...rest }: {
  printing?: boolean; done?: boolean; className?: string; children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(styles.paper, printing && styles.printing, done && styles.done, className)} {...rest}>
      {children}
    </div>
  );
}

/** Línea punteada del ticket (separa encabezado / ítems / total). */
export function TicketRule({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('border-t', styles.dashed, className)} />;
}

export function StoreComanda({
  orders, loaded, user, storeId,
}: {
  /** Pedidos en 'Pendiente de Confirmación' de la tienda (cualquier orden). */
  orders: ComandaOrder[];
  /** true cuando la consulta ya trajo su primer resultado (para no sonar en la carga). */
  loaded: boolean;
  user: User | null | undefined;
  storeId: string | undefined;
}) {
  const { toast } = useToast();
  const sorted = useMemo(
    () => [...orders].sort((a, b) => (createdMs(b) ?? 0) - (createdMs(a) ?? 0)),
    [orders],
  );

  // Reloj de la cancelación automática (Fase YY): esta pantalla también lo da.
  const confirmTimes = useConfirmTimeoutWatcher(sorted, user);

  // ── Pedidos nuevos: imprimir + sonar (nunca en la carga inicial) ──
  // `initialIds` = lo que había al cargar (no se imprime ni suena). Un ticket que no está ahí
  // nace YA con la clase de impresión (se decide en el render, sin un cuadro previo sin
  // animar); el efecto solo hace sonar el aviso una vez por pedido nuevo.
  const [initialIds, setInitialIds] = useState<Set<string> | null>(null);
  const soundedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!loaded) return;
    if (initialIds === null) { setInitialIds(new Set(sorted.map(o => o.id))); return; }
    const fresh = sorted.filter(o => !initialIds.has(o.id) && !soundedRef.current.has(o.id));
    if (fresh.length === 0) return;
    fresh.forEach(o => soundedRef.current.add(o.id));
    playSound();
  }, [sorted, loaded, initialIds]);
  const isPrinting = (id: string) => initialIds !== null && !initialIds.has(id);

  // ── Confirmar (pedido completo) ──
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Ticket confirmado que se va "arrancando" aunque el listener ya lo haya sacado.
  const [leaving, setLeaving] = useState<Record<string, ComandaOrder>>({});
  const handleConfirm = async (order: ComandaOrder) => {
    if (confirmingId) return; // anti doble toque, igual que /orders
    setConfirmingId(order.id);
    try {
      const r = await confirmStoreOrder(user, { orderId: order.id, storeId });
      setLeaving(prev => ({ ...prev, [order.id]: order }));
      window.setTimeout(() => setLeaving(prev => { const n = { ...prev }; delete n[order.id]; return n; }), EXIT_MS);
      toast({ title: r.title, description: r.description });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo confirmar', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setConfirmingId(null);
    }
  };

  const shown: { order: ComandaOrder; done: boolean }[] = [
    ...sorted.map(o => ({ order: o, done: !!leaving[o.id] })),
    ...Object.values(leaving).filter(o => !sorted.some(s => s.id === o.id)).map(o => ({ order: o, done: true })),
  ];

  return (
    <Card className="relative space-y-3 p-4 sm:p-5" data-testid="store-comanda">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-headline text-2xl font-extrabold leading-none">
          <Printer className="h-5 w-5 text-primary" aria-hidden="true" /> Para confirmar
        </h2>
        {sorted.length > 0 && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold text-primary-foreground tabular-nums">
            {sorted.length}
          </span>
        )}
      </div>

      <div aria-live="polite" className="space-y-3">
        {!loaded ? (
          <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.06]" aria-busy="true" />
        ) : shown.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-foreground/15 px-4 py-6 text-center text-base text-muted-foreground" data-testid="comanda-empty">
            Sin pedidos nuevos. Cuando entre uno, suena y se imprime acá.
          </p>
        ) : (
          <>
            <div aria-hidden="true" className={styles.slot} />
            {shown.map(({ order, done }) => (
              <ComandaTicket
                key={order.id}
                order={order}
                printing={isPrinting(order.id)}
                done={done}
                timeoutAt={confirmTimes[order.id]?.timeoutAt}
                busy={confirmingId === order.id}
                disabled={confirmingId !== null || done}
                onConfirm={() => handleConfirm(order)}
              />
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

function ComandaTicket({ order, printing, done, timeoutAt, busy, disabled, onConfirm }: {
  order: ComandaOrder; printing: boolean; done: boolean; timeoutAt: number | null | undefined;
  busy: boolean; disabled: boolean; onConfirm: () => void;
}) {
  const ms = createdMs(order);
  const who = order.customerName || 'Cliente';
  const items = order.items ?? [];
  return (
    <StoreTicketPaper
      printing={printing}
      done={done}
      role="article"
      aria-label={`Pedido nuevo de ${who}`}
      data-testid="comanda-ticket"
      data-order-id={order.id}
    >
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <b className="min-w-0 truncate font-headline text-2xl font-extrabold">{who}</b>
        <span className="shrink-0 text-sm text-muted-foreground">
          #{order.id.slice(0, 6)}{ms ? ` · ${fmtDate(ms, 'time')}` : ''}
        </span>
      </div>
      <TicketRule />
      <ul className="my-2 space-y-1 text-base">
        {items.map((it, i) => (
          <li key={it.id || i} className="flex gap-2">
            <span className="min-w-[2.2rem] font-extrabold tabular-nums">{it.quantity ?? 1}×</span>
            <span className="min-w-0 break-words">{it.title || it.name || 'Producto'}</span>
          </li>
        ))}
      </ul>
      <TicketRule />
      <div className="flex items-center justify-between gap-2 pt-2 font-bold">
        <span>Total del pedido</span>
        <span className="rounded-full bg-foreground/[0.08] px-3 py-0.5 font-headline text-xl font-extrabold tabular-nums">
          {money(Number(order.total) || 0)}
        </span>
      </div>
      <ConfirmCountdown timeoutAt={timeoutAt} variant="store" className="mt-3 rounded-xl" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-auto min-h-12 whitespace-normal rounded-xl border-2 border-foreground bg-transparent px-2 py-2 text-base font-bold leading-tight">
          <Link href="/orders?tab=pending" data-testid="comanda-adjust">
            <SlidersHorizontal className="shrink-0" aria-hidden="true" /> Ajustar o sacar productos
          </Link>
        </Button>
        <Button
          type="button"
          className="h-auto min-h-12 rounded-xl text-base font-bold"
          onClick={onConfirm}
          disabled={disabled}
          data-testid="comanda-confirm"
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          {busy ? 'Confirmando…' : 'Confirmar'}
        </Button>
      </div>
    </StoreTicketPaper>
  );
}
