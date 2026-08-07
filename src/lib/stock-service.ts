import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/nextjs';

/**
 * Devolución de stock al inventario.
 *
 * 🚨 El agujero que cierra: `/api/orders/create` DESCUENTA stock al crear el pedido
 * (reserva las unidades dentro de una transacción), pero ningún camino lo devolvía. Un
 * pedido cancelado o rechazado dejaba esas unidades descontadas para siempre: el catálogo
 * decía "quedan 3" cuando en el depósito había 5, y con el tiempo un producto real terminaba
 * figurando agotado sin estarlo.
 *
 * Es el espejo exacto de lo que hace `create`, y por eso repite sus mismas dos reglas:
 *   1. Busca el producto en la subcolección `products` y después en `items` (compat legacy).
 *   2. Solo toca productos con `stock != null` — sin valor significa "sin límite", y crear
 *      el campo acá convertiría un producto ilimitado en uno finito.
 */

export type StockReturnResult = {
  /** false = ya se había devuelto antes (idempotencia), no se tocó nada. */
  applied: boolean;
  /** Unidades efectivamente devueltas al catálogo. */
  unitsReturned: number;
  /** Productos que ya no existen en el catálogo (se saltean, no rompen la operación). */
  missingProducts: string[];
};

type OrderItem = { id?: string; quantity?: number | string };

/**
 * Devuelve al catálogo las unidades reservadas por un pedido.
 *
 * **Idempotente:** marca la orden con `stockReturnedAt` DENTRO de la misma transacción que
 * escribe el stock. Si se llama dos veces (doble click, reintento de red, un admin que
 * cancela lo que el comprador ya canceló) la segunda vez no hace nada. Sin esa guarda,
 * cancelar dos veces inflaría el inventario — el error inverso, y más difícil de detectar
 * que el original.
 *
 * @param orderId  Pedido cuya reserva se libera.
 * @param opts.items  Ítems a devolver. Por defecto, los del propio pedido. Se pasa explícito
 *                    cuando solo hay que devolver una parte (ítems sacados por la tienda).
 * @param opts.marker Campo de idempotencia. Permite que dos devoluciones distintas sobre el
 *                    mismo pedido (parcial al confirmar, total al cancelar) no se pisen.
 */
export async function returnStockForOrder(
  orderId: string,
  opts: { items?: OrderItem[]; marker?: string; reason?: string } = {},
): Promise<StockReturnResult> {
  const marker = opts.marker || 'stockReturnedAt';
  const orderRef = adminDb.collection('orders').doc(orderId);

  try {
    return await adminDb.runTransaction<StockReturnResult>(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        return { applied: false, unitsReturned: 0, missingProducts: [] };
      }
      const order = orderSnap.data()!;

      // Guarda de idempotencia: se lee y se escribe en la MISMA transacción, así dos
      // llamadas simultáneas no pueden pasar las dos.
      if (order[marker]) {
        return { applied: false, unitsReturned: 0, missingProducts: [] };
      }

      const storeId = order.storeId;
      const items: OrderItem[] = opts.items ?? order.items ?? [];
      if (!storeId || items.length === 0) {
        tx.update(orderRef, { [marker]: Timestamp.now() });
        return { applied: true, unitsReturned: 0, missingProducts: [] };
      }

      // Pasada 1 — TODAS las lecturas antes de cualquier escritura (lo exige Firestore).
      const updates: { ref: FirebaseFirestore.DocumentReference; quantity: number }[] = [];
      const missingProducts: string[] = [];

      for (const item of items) {
        const itemId = item.id;
        const quantity = Number(item.quantity) || 0;
        if (!itemId || quantity <= 0) continue;

        // Mismo orden de subcolecciones que /api/orders/create.
        let productRef = adminDb.collection('stores').doc(storeId).collection('products').doc(itemId);
        let productSnap = await tx.get(productRef);
        if (!productSnap.exists) {
          productRef = adminDb.collection('stores').doc(storeId).collection('items').doc(itemId);
          productSnap = await tx.get(productRef);
        }

        // El producto se borró del catálogo después del pedido: no hay dónde devolver.
        // No es un error — se saltea y queda registrado en el resultado.
        if (!productSnap.exists) {
          missingProducts.push(itemId);
          continue;
        }

        // `stock == null` = sin límite. `create` no descontó nada, así que no hay nada que
        // devolver; escribir el campo acá le pondría un techo al producto por accidente.
        if (productSnap.data()?.stock == null) continue;

        updates.push({ ref: productRef, quantity });
      }

      // Pasada 2 — escrituras. `increment` en vez de leer-sumar-escribir: si la tienda
      // reabasteció mientras tanto, la devolución se suma a lo nuevo en vez de pisarlo.
      let unitsReturned = 0;
      for (const { ref, quantity } of updates) {
        tx.update(ref, { stock: FieldValue.increment(quantity) });
        unitsReturned += quantity;
      }

      tx.update(orderRef, {
        [marker]: Timestamp.now(),
        ...(opts.reason ? { stockReturnReason: opts.reason } : {}),
      });

      return { applied: true, unitsReturned, missingProducts };
    });
  } catch (e) {
    // No relanza: devolver stock no debe abortar la cancelación que ya ocurrió. Pero es
    // inventario real, así que el fallo tiene que ser visible y no morir en un log.
    console.error('[stock-service] No se pudo devolver el stock:', e);
    Sentry.captureException(e, { tags: { area: 'stock-return' }, extra: { orderId, marker } });
    return { applied: false, unitsReturned: 0, missingProducts: [] };
  }
}

/**
 * Pone en 0 el stock de los productos que la tienda destildó al confirmar un pedido.
 *
 * Decisión de producto (no es el inverso de `create`, a propósito): cuando la tienda saca un
 * ítem está diciendo "no tengo esto". Devolver las unidades reservadas dejaría el catálogo
 * con el mismo número que la tienda acaba de desmentir, y el próximo cliente pediría lo
 * mismo y fallaría igual. Ponerlo en 0 usa el dato más fresco que tenemos y corta ese loop;
 * la tienda corrige el número cuando repone, desde su panel de productos.
 *
 * Solo toca productos con `stock != null` — sin valor significa "sin límite" y ponerle 0 lo
 * dejaría agotado para siempre sin que la tienda entienda por qué.
 */
export async function zeroStockForItems(
  storeId: string,
  items: OrderItem[],
): Promise<{ zeroed: string[] }> {
  const zeroed: string[] = [];
  if (!storeId || !items?.length) return { zeroed };

  try {
    for (const item of items) {
      if (!item.id) continue;

      let productRef = adminDb.collection('stores').doc(storeId).collection('products').doc(item.id);
      let productSnap = await productRef.get();
      if (!productSnap.exists) {
        productRef = adminDb.collection('stores').doc(storeId).collection('items').doc(item.id);
        productSnap = await productRef.get();
      }
      if (!productSnap.exists) continue;
      if (productSnap.data()?.stock == null) continue;

      await productRef.update({ stock: 0 });
      zeroed.push(item.id);
    }
  } catch (e) {
    // Igual que arriba: no aborta la confirmación del pedido, que ya ocurrió.
    console.error('[stock-service] No se pudo poner el stock en 0:', e);
    Sentry.captureException(e, { tags: { area: 'stock-zero' }, extra: { storeId } });
  }

  return { zeroed };
}
