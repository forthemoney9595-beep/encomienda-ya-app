import { adminDb, adminMessaging } from "./firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { pruneDeadFcmTokens } from "./notify-server";

// Broadcast a repartidores (campanita + push FCM), en UN solo lugar (Fase RR bis).
//
// Antes vivía inline en /api/orders/notify-drivers y el aviso dependía de que la tienda
// tocara UN botón específico del panel — pero el pedido entra al pool de "Disponibles"
// desde que se paga ('En preparación'), y el otro camino de la tienda (marcar "Listo
// para recoger" desde el detalle) no avisaba a NADIE. En la prueba real el repartidor
// vio el pedido en la lista sin que le llegara ninguna notificación (0 docs
// `delivery_request` en la base). Misma familia de bug que la Fase R1: dos caminos,
// uno mudo.
//
// Ahora: el webhook de MP (y el aprobador de prueba) disparan el broadcast APENAS el
// pedido queda pagado — el momento exacto en que los repartidores ya pueden tomarlo —
// y los dos caminos de la tienda re-avisan "ya está listo" por acá mismo.
//
// Solo aprobados (los pendientes no pueden tomar pedidos, per isApprovedDriver() en
// firestore.rules) y no explícitamente desconectados (isOnline !== false — sin campo
// = disponible, para no dejar de avisarle a nadie que nunca tocó el switch).
export async function broadcastOrderToDrivers(opts: {
  orderId: string;
  title: string;
  body: string;
  /** true = además marca readyForPickup/lastDriverNotification en la orden (aviso "ya está listo" de la tienda). */
  markReady?: boolean;
}): Promise<{ notified: number; pushed: number }> {
  const { orderId, title, body, markReady } = opts;

  const driversSnap = await adminDb
    .collection("users")
    .where("role", "==", "delivery")
    .where("isApproved", "==", true)
    .get();
  const onlineDrivers = driversSnap.docs.filter((d) => d.data().isOnline !== false);
  if (onlineDrivers.length === 0) return { notified: 0, pushed: 0 };

  const batch = adminDb.batch();
  onlineDrivers.forEach((driverDoc) => {
    const notifRef = adminDb.collection("notifications").doc();
    batch.set(notifRef, {
      userId: driverDoc.id,
      title,
      body,
      type: "delivery_request",
      orderId,
      read: false,
      createdAt: Timestamp.now(),
      icon: "alert",
    });
  });
  if (markReady) {
    // Server-side para que los DOS caminos de la tienda dejen la misma marca (antes
    // solo el botón del panel la escribía, desde el cliente).
    batch.set(
      adminDb.collection("orders").doc(orderId),
      { readyForPickup: true, lastDriverNotification: Timestamp.now() },
      { merge: true },
    );
  }
  await batch.commit();

  let pushed = 0;
  try {
    const tokens: string[] = [];
    // token → [uids dueños]: un mismo token puede vivir en varias cuentas (mismo
    // navegador logueado en varias) y si está muerto hay que limpiarlo de todas.
    const owners = new Map<string, string[]>();
    const collect = (t: unknown, uid: string) => {
      if (!t || typeof t !== "string") return;
      tokens.push(t);
      owners.set(t, [...(owners.get(t) || []), uid]);
    };
    for (const d of onlineDrivers) {
      const u = d.data();
      collect(u.fcmToken, d.id);
      if (Array.isArray(u.fcmTokens)) u.fcmTokens.forEach((t: unknown) => collect(t, d.id));
    }
    const uniq = [...new Set(tokens)];
    if (uniq.length > 0) {
      const res = await adminMessaging.sendEachForMulticast({
        tokens: uniq,
        notification: { title, body },
        webpush: { fcmOptions: { link: "/orders" } },
        data: { url: "/orders", orderId },
      });
      pushed = res.successCount;
      // Tokens que FCM reportó muertos → se sacan de las cuentas (Fase RR septies).
      await pruneDeadFcmTokens(uniq, res.responses, owners);
    }
  } catch (e) {
    console.error("[driver-broadcast] push falló:", e);
  }

  return { notified: onlineDrivers.length, pushed };
}
