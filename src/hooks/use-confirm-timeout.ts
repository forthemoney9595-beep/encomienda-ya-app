'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { authedFetch } from '@/lib/authed-fetch';
import { PENDING_CONFIRMATION } from '@/lib/confirm-timeout';

// Disparador de cliente del recordatorio / cancelación automática (Fase YY).
//
// Vercel Hobby no permite un cron por minuto, así que el "reloj" lo dan las pantallas que
// están mirando el pedido: el detalle del comprador, el panel de la tienda (sus Nuevos) y
// la Bandeja del admin. Por cada pedido 'Pendiente de Confirmación':
//   1. llama UNA vez a /api/orders/confirm-timeout al verlo (devuelve los dos momentos y,
//      si ya venció algo mientras nadie miraba, el servidor lo aplica en esa misma llamada);
//   2. programa un timer al recordatorio y otro al vencimiento.
// El servidor decide con SU reloj; si el del navegador está adelantado y la llamada llega
// antes de tiempo, contesta 'none' y acá se reintenta unos segundos después (con tope).
// Es idempotente del lado servidor: tres pantallas disparando a la vez no hacen nada doble.
// Con Vercel Pro, un cron por minuto reemplaza este hook (puede quedar, es inofensivo).

export type ConfirmTimes = { reminderAt: number | null; timeoutAt: number | null; action?: string };

const SLACK_MS = 1_500;      // margen sobre el momento exacto (reloj del servidor ≠ navegador)
const RETRY_MS = 5_000;      // si el servidor todavía no lo ve vencido
const MAX_RETRIES = 6;
const MAX_ORDERS = 30;       // tope defensivo (Bandeja con muchos pedidos sin confirmar)

type Tracked = { timers: number[]; retries: number };

export function useConfirmTimeoutWatcher(
  orders: { id: string; status?: string }[] | null | undefined,
  user: User | null | undefined,
): Record<string, ConfirmTimes> {
  const [times, setTimes] = useState<Record<string, ConfirmTimes>>({});
  const tracked = useRef(new Map<string, Tracked>());

  // Clave estable: solo cambia cuando entra o sale un pedido pendiente.
  const pendingKey = useMemo(
    () => (orders ?? []).filter(o => o.status === PENDING_CONFIRMATION).map(o => o.id).sort().slice(0, MAX_ORDERS).join(','),
    [orders],
  );

  useEffect(() => {
    if (!user) return;
    const ids = pendingKey ? pendingKey.split(',') : [];
    const map = tracked.current;

    // Pedidos que dejaron de estar pendientes: se apagan sus timers.
    for (const [id, t] of map.entries()) {
      if (!ids.includes(id)) { t.timers.forEach(h => window.clearTimeout(h)); map.delete(id); }
    }

    const call = async (id: string, kind: 'initial' | 'reminder' | 'timeout') => {
      const t = map.get(id);
      if (!t) return;
      try {
        const res = await authedFetch('/api/orders/confirm-timeout', user, { orderId: id });
        if (!res.ok) return;
        const data = await res.json() as ConfirmTimes & { status?: string };
        if (!map.has(id)) return;
        setTimes(prev => ({ ...prev, [id]: { reminderAt: data.reminderAt ?? null, timeoutAt: data.timeoutAt ?? null, action: data.action } }));
        if (data.status && data.status !== PENDING_CONFIRMATION) return;

        const now = Date.now();
        if (kind === 'initial') {
          if (data.reminderAt && data.reminderAt > now) t.timers.push(window.setTimeout(() => void call(id, 'reminder'), data.reminderAt - now + SLACK_MS));
          if (data.timeoutAt) t.timers.push(window.setTimeout(() => void call(id, 'timeout'), Math.max(0, data.timeoutAt - now) + SLACK_MS));
          return;
        }
        // Al vencimiento el servidor contestó 'none' con el pedido todavía pendiente: su reloj
        // aún no llegó (el navegador está adelantado). Reintentar un poco después, con tope.
        // (El recordatorio no se reintenta: 'none' ahí también significa "ya lo mandó otro".)
        if (kind === 'timeout' && data.action === 'none' && t.retries < MAX_RETRIES) {
          t.retries++;
          t.timers.push(window.setTimeout(() => void call(id, kind), RETRY_MS));
        }
      } catch {
        // Sin red / sesión vencida: el próximo que mire el pedido (o el cron) lo resuelve.
      }
    };

    for (const id of ids) {
      if (map.has(id)) continue;
      map.set(id, { timers: [], retries: 0 });
      void call(id, 'initial');
    }
  }, [pendingKey, user]);

  // Al desmontar: apagar todo.
  useEffect(() => {
    const map = tracked.current;
    return () => {
      for (const t of map.values()) t.timers.forEach(h => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  return times;
}
