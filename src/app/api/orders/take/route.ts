import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { notifyUser } from "@/lib/notify-server";
import { MAX_ACTIVE_ORDERS } from "@/lib/order-service";

// Tomar un pedido del pool (repartidor). Antes era un updateDoc directo del cliente sobre
// orders/{id}. Ahora pasa por acá (AUTHZ-001) por dos razones:
//   1. Espejar `deliveryPersonId` dentro de order_private/{id} en la MISMA transacción que
//      asigna el pedido, para que la regla de lectura de order_private compare su PROPIO
//      campo (resource.data.deliveryPersonId == uid) en vez de un get(orders/{id}) — ese
//      get() de reglas lee con lag un campo recién escrito y dejaba al repartidor sin poder
//      ver la dirección justo después de tomar el pedido.
//   2. Centralizar las guardas (repartidor aprobado, no es su propio pedido, tope de activos)
//      server-side.
// La toma sigue siendo claim-once: la tx verifica deliveryPersonId==null adentro, así dos
// repartidores no pueden tomar el mismo pedido a la vez.
const POOL_STATUSES = ['En preparación', 'Listo para recoger'];

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:take', 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const uid = await verifyAuthToken(request);
  if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { orderId } = await request.json();
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: "Falta orderId" }, { status: 400 });
    }

    // Repartidor aprobado (mismo gate que isApprovedDriver() en las reglas).
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const u = userSnap.data();
    if (!u || u.role !== 'delivery' || u.isApproved !== true) {
      return NextResponse.json({ error: "Tu cuenta de repartidor no está aprobada para tomar pedidos." }, { status: 403 });
    }
    const driverName = u.name || u.displayName || 'Un repartidor';

    // Tope de pedidos activos simultáneos (guardrail de UX, no de seguridad — igual que en
    // el cliente). Se cuenta fuera de la tx: no es un invariante crítico de plata.
    const activeSnap = await adminDb.collection('orders')
      .where('deliveryPersonId', '==', uid)
      .where('status', 'in', ['En camino', 'En reparto', 'En preparación', 'Listo para recoger'])
      .get();
    if (activeSnap.size >= MAX_ACTIVE_ORDERS) {
      return NextResponse.json({ error: `Ya tenés ${MAX_ACTIVE_ORDERS} pedidos en curso. Terminá alguno antes de tomar otro.` }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const privateRef = adminDb.collection('order_private').doc(orderId);
    let buyerId: string | null = null;
    let storeTarget: string | null = null;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new Error('__NOT_FOUND__');
      const o = snap.data()!;
      // claim-once: solo si sigue libre y en un estado del pool.
      if (o.deliveryPersonId != null) throw new Error('__ALREADY_TAKEN__');
      if (!POOL_STATUSES.includes(o.status)) throw new Error('__NOT_AVAILABLE__');
      // no es su propio pedido (envío gratis / auto-calificación).
      if (o.userId === uid) throw new Error('__OWN_ORDER__');

      buyerId = o.userId || null;
      storeTarget = o.storeOwnerId || o.storeId || null;

      tx.update(orderRef, {
        deliveryPersonId: uid,
        deliveryPersonName: driverName,
        status: 'En camino',
        takenAt: Timestamp.now(),
      });
      // 🔒 Espejo para que order_private se lea por su PROPIO campo (sin get() con lag).
      tx.set(privateRef, { deliveryPersonId: uid }, { merge: true });
    });

    // Avisos (fuera de la tx; un fallo acá no revierte la toma).
    if (storeTarget) {
      await notifyUser({ userId: storeTarget, title: "🛵 Repartidor en camino", body: `${driverName} aceptó el pedido y va a retirarlo.`, type: 'order_status', orderId, link: `/orders/${orderId}` });
    }
    if (buyerId) {
      await notifyUser({ userId: buyerId, title: "🛵 Repartidor Asignado", body: "Un repartidor está yendo a retirar tu pedido.", type: 'order_status', orderId, link: `/orders/${orderId}` });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const map: Record<string, [number, string]> = {
      __NOT_FOUND__: [404, "Pedido no encontrado."],
      __ALREADY_TAKEN__: [409, "Otro repartidor tomó este pedido un instante antes."],
      __NOT_AVAILABLE__: [409, "Este pedido ya no está disponible."],
      __OWN_ORDER__: [400, "No podés tomar tu propio pedido."],
    };
    if (error?.message && map[error.message]) {
      const [status, msg] = map[error.message];
      return NextResponse.json({ error: msg }, { status });
    }
    console.error("❌ Error tomando pedido:", error);
    Sentry.captureException(error, { tags: { route: "orders/take" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
