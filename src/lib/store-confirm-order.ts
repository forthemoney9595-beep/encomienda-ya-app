import type { User } from 'firebase/auth';
import { authedFetch } from '@/lib/authed-fetch';

// Confirmar un pedido nuevo desde la tienda (rediseño en vidrio, 9/11/2026).
//
// ÚNICA llamada a /api/orders/confirm-stock del panel de la tienda: la usan la pestaña
// "Nuevos" de /orders (store-orders-view.tsx, con checkboxes y −/+) y la comanda de
// /my-store (confirmar el pedido completo). Lección R1: dos botones que hacen lo mismo con
// dos llamadas distintas terminan divergiendo. El servidor recalcula todo (precios, total,
// comisión, stock): acá solo viaja qué se saca y qué se reduce.
//
// Lanza Error con el mensaje del servidor si no se pudo; el que llama muestra el toast.

export type ConfirmStoreOrderInput = {
  orderId: string;
  storeId: string | undefined;
  /** Ítems que la tienda destildó (no los tiene). */
  removedItemIds?: string[];
  /** itemId → cantidad a preparar (solo REDUCIR; el servidor rechaza aumentar). */
  adjustedQuantities?: Record<string, number>;
};

export type ConfirmStoreOrderResult = {
  changed: boolean;
  removedCount: number;
  adjustedCount: number;
  /** Texto listo para el toast de éxito. */
  title: string;
  description: string;
};

export async function confirmStoreOrder(user: User | null | undefined, input: ConfirmStoreOrderInput): Promise<ConfirmStoreOrderResult> {
  const removedItemIds = input.removedItemIds ?? [];
  // No mandar ajustes de ítems que además se destildaron (sacar gana).
  const cleanAdjusted = Object.fromEntries(
    Object.entries(input.adjustedQuantities ?? {}).filter(([id]) => !removedItemIds.includes(id)),
  );
  const res = await authedFetch('/api/orders/confirm-stock', user ?? null, {
    orderId: input.orderId,
    storeId: input.storeId,
    removedItemIds,
    adjustedQuantities: cleanAdjusted,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'No se pudo confirmar el pedido.');

  const removedCount = removedItemIds.length;
  const adjustedCount = Object.keys(cleanAdjusted).length;
  const changed = removedCount > 0 || adjustedCount > 0;
  return {
    changed,
    removedCount,
    adjustedCount,
    title: changed ? 'Confirmado con cambios' : 'Pedido confirmado',
    description: changed
      ? [
          removedCount > 0 ? `${removedCount} producto(s) sacado(s)` : '',
          adjustedCount > 0 ? `${adjustedCount} con cantidad reducida` : '',
        ].filter(Boolean).join(' · ') + '. El cliente ya tiene el nuevo total.'
      : 'Le avisamos al cliente para que pague.',
  };
}
