'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { authedFetch } from '@/lib/authed-fetch';
import { MAX_ACTIVE_ORDERS } from '@/lib/order-service';
import { playSound } from '@/lib/notify-sounds';

/** Lo mínimo de un pedido del pool que necesita la acción de tomar. */
export interface TakeableOrder {
  id: string;
  userId?: string;
  storeName?: string;
}

/**
 * "Tomar pedido" del repartidor: ÚNICA lógica, la usan el panel de entregas
 * (`/orders`, delivery-orders-view.tsx) y el dashboard (`/delivery`). Lección R1: dos
 * caminos que hacen lo mismo con código propio terminan divergiendo (en la Fase PP el
 * segundo camino salteaba el tope y el gate de aprobación).
 *
 * Mismas guardas de siempre, en el mismo orden:
 * - antidoble-toque (ref, no estado: el estado llega tarde al segundo toque);
 * - su propio pedido no (la regla y la API también lo bloquean);
 * - solo aprobados, con el texto de suspendido distinto del de pendiente (Fase YY ter);
 * - tope `MAX_ACTIVE_ORDERS`;
 * - la asignación va por `/api/orders/take` (AUTHZ-001: claim-once en una transacción y
 *   espejo de `deliveryPersonId` en `order_private`).
 *
 * `onTaken` corre solo si el servidor confirmó la asignación.
 */
export function useDriverTakeOrder({
  activeCount,
  onTaken,
}: {
  activeCount: number;
  onTaken?: (order: TakeableOrder) => void;
}) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [takingId, setTakingId] = useState<string | null>(null);
  const takingRef = useRef(false);

  const isApprovedDriver = userProfile?.isApproved === true;
  const isSuspended = userProfile?.suspension?.active === true;
  const atLimit = activeCount >= MAX_ACTIVE_ORDERS;

  const takeOrder = useCallback(async (order: TakeableOrder) => {
    if (!user) return;
    // Doble toque (prueba del 9/11): con la respuesta lenta salían DOS pedidos a la API; uno
    // lo tomaba y el otro volvía 409 → el repartidor veía "Pedido ya tomado" aunque era suyo.
    if (takingRef.current) return;
    if (order.userId === user.uid) {
      toast({ variant: 'destructive', title: 'Este pedido es tuyo', description: 'Tu propio pedido lo lleva otro repartidor.' });
      return;
    }
    if (!isApprovedDriver) {
      toast({
        variant: 'destructive',
        title: isSuspended ? 'Cuenta suspendida' : 'Cuenta pendiente de aprobación',
        description: isSuspended
          ? 'No podés tomar pedidos nuevos mientras dure la suspensión. Mirá el motivo arriba y, si no estás de acuerdo, apelá.'
          : 'Un administrador debe aprobar tu cuenta antes de que puedas tomar pedidos.',
      });
      return;
    }
    if (atLimit) {
      toast({
        variant: 'destructive',
        title: 'Ya tenés el máximo de pedidos en curso',
        description: `Terminá alguno de tus ${MAX_ACTIVE_ORDERS} pedidos activos antes de tomar otro.`,
      });
      return;
    }
    takingRef.current = true;
    setTakingId(order.id);
    try {
      const res = await authedFetch('/api/orders/take', user, { orderId: order.id });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: res.status === 409 ? 'Pedido ya tomado' : 'No se pudo tomar', description: data.error || 'Probá de nuevo.' });
        return;
      }
      toast({
        title: 'Pedido tomado',
        description: order.storeName ? `Andá a ${order.storeName} a retirarlo.` : 'Andá a la tienda a retirarlo.',
      });
      onTaken?.(order);
    } catch (error: unknown) {
      console.error(error);
      const isPermissionDenied = (error as { code?: string })?.code === 'permission-denied';
      toast({
        variant: 'destructive',
        title: isPermissionDenied ? 'Pedido ya tomado' : 'Error',
        description: isPermissionDenied
          ? 'Otro repartidor ya tomó este pedido justo antes que vos.'
          : 'No se pudo tomar el pedido.',
      });
    } finally {
      takingRef.current = false;
      setTakingId(null);
    }
  }, [user, toast, isApprovedDriver, isSuspended, atLimit, onTaken]);

  /** Texto del botón para ESE pedido (el que se está tomando dice "Tomando…"). */
  const takeLabel = (orderId: string) =>
    takingId === orderId
      ? 'Tomando el pedido…'
      : !isApprovedDriver
        ? (isSuspended ? 'Cuenta suspendida' : 'Cuenta pendiente de aprobación')
        : atLimit
          ? `Ya tenés ${MAX_ACTIVE_ORDERS} pedidos en curso`
          : 'Tomar pedido';

  /** Mientras se toma uno, todos los botones de tomar quedan bloqueados. */
  const takeDisabled = !isApprovedDriver || atLimit || takingId !== null;

  return { takeOrder, takingId, takeLabel, takeDisabled, isApprovedDriver, isSuspended };
}

/**
 * Suena (con el sonido elegido en el Perfil) cuando aparece un pedido NUEVO en el pool
 * mientras el repartidor mira la pantalla. Nunca en la carga inicial.
 *
 * Recibe el array CRUDO de `useCollection` y su consulta. La "base" es el primer snapshot que
 * llega DESPUÉS de armarse la consulta: se reconoce porque `useCollection` reemplaza el array
 * (`setData`) recién cuando responde Firestore. No se usa `isLoading`: en el render en que
 * la consulta pasa de null a armada todavía vale false, y con la caché local el true puede
 * no llegar a pintarse nunca (primera versión: sonaba al abrir la pantalla).
 * Su propio pedido (`myUid`) no cuenta: no aparece en su pool.
 */
export function useDriverPoolSound(data: { id: string; userId?: string }[], query: unknown, myUid?: string) {
  const st = useRef<{ q: unknown; initial: unknown; seen: Set<string> | null }>({ q: null, initial: null, seen: null });
  useEffect(() => {
    const s = st.current;
    if (!query) { s.q = null; s.initial = null; s.seen = null; return; }
    if (s.q !== query) { s.q = query; s.initial = data; s.seen = null; return; }
    if (s.seen === null) {
      if (data === s.initial) return;
      s.seen = new Set(data.map(o => o.id));
      return;
    }
    const fresh = data.filter(o => !s.seen!.has(o.id) && o.userId !== myUid);
    for (const o of data) s.seen.add(o.id);
    if (fresh.length > 0) playSound();
  }, [data, query, myUid]);
}
