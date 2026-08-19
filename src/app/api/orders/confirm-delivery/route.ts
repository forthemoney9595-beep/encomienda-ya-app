import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { notifyUser } from "@/lib/notify-server";

/**
 * PIN de entrega (19/8) — el repartidor marca 'Entregado' SOLO por acá.
 *
 * Antes "Confirmar Entrega" era un updateDoc directo del repartidor (tres botones
 * distintos), sin ninguna verificación: en un reclamo de "no me llegó" era la palabra
 * del cliente contra la del repartidor, y nada impedía marcar entregado sin entregar.
 * Ahora cada pedido nace con un código de 4 dígitos que SOLO ve el comprador
 * (`orders/{id}/secure/pin`, regla de lectura por userId); el repartidor se lo pide al
 * entregar y ESTE endpoint lo valida. Mismo patrón que Rappi/PedidosYa/Uber Eats.
 *
 * - Pedidos viejos sin PIN (anteriores al deploy): se completan sin código (fallback
 *   legacy) — si no, los pedidos en vuelo durante el deploy quedaban clavados.
 * - Cliente ausente / sin código: el repartidor usa "Reportar problema" (ya existe)
 *   y lo resuelve el admin — a propósito NO hay bypass desde este endpoint.
 * - Tope de 10 intentos por pedido (contado en el doc del PIN, en transacción):
 *   con 4 dígitos y rate limit, adivinarlo no es práctico; el tope lo vuelve imposible.
 * - La regla de Firestore dejó de aceptar 'Entregado' del repartidor (mismo criterio
 *   que 'Rechazado' en la Fase MM): sin la regla, este endpoint sería decorativo.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "orders:confirm-delivery", 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const orderId = String(body?.orderId || "");
  const pin = body?.pin != null ? String(body.pin).trim() : null;
  if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

  try {
    const orderRef = adminDb.collection("orders").doc(orderId);
    const pinRef = orderRef.collection("secure").doc("pin");

    // Sentinelas para mapear el resultado de la transacción a HTTP sin relanzar adentro.
    const result = await adminDb.runTransaction(async (tx) => {
      const [orderSnap, pinSnap] = await Promise.all([tx.get(orderRef), tx.get(pinRef)]);
      if (!orderSnap.exists) return { fail: "not_found" as const };
      const order = orderSnap.data()!;

      if (order.deliveryPersonId !== callerUid) return { fail: "not_yours" as const };
      if (order.status !== "En reparto") return { fail: "bad_status" as const, status: order.status };

      if (pinSnap.exists) {
        const stored = pinSnap.data()!;
        const attempts = Number(stored.attempts || 0);
        if (attempts >= 10) return { fail: "too_many_attempts" as const };
        if (!pin) return { fail: "pin_required" as const };
        if (String(stored.pin) !== pin) {
          tx.update(pinRef, { attempts: attempts + 1, lastAttemptAt: Timestamp.now() });
          return { fail: "wrong_pin" as const };
        }
        tx.update(pinRef, { usedAt: Timestamp.now() });
      }
      // Sin doc de PIN = pedido anterior a esta función → se completa sin código.

      tx.update(orderRef, {
        status: "Entregado",
        deliveredAt: Timestamp.now(),
        // La posición en vivo del repartidor no queda guardada en la orden (Fase RR).
        driverCoords: FieldValue.delete(),
        // Prueba de entrega para reclamos: quedó validado con el código del comprador.
        deliveryPinVerified: pinSnap.exists,
        updatedAt: Timestamp.now(),
      });
      return { ok: true as const, order };
    });

    if ("fail" in result) {
      switch (result.fail) {
        case "not_found":
          return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        case "not_yours":
          return NextResponse.json({ error: "Este pedido no está asignado a tu cuenta." }, { status: 403 });
        case "bad_status":
          return NextResponse.json(
            { error: `El pedido está "${result.status}" — solo se confirma la entrega desde "En reparto".` },
            { status: 400 },
          );
        case "pin_required":
          // No es un error para el cliente: le dice a la UI "pedile el código".
          return NextResponse.json({ error: "pin_required" }, { status: 428 });
        case "wrong_pin":
          return NextResponse.json(
            { error: "Código incorrecto. Pedile al cliente el código de su pantalla del pedido." },
            { status: 403 },
          );
        case "too_many_attempts":
          return NextResponse.json(
            { error: "Demasiados intentos con código incorrecto. Usá «Reportar problema» para que lo resuelva la administración." },
            { status: 429 },
          );
      }
    }

    // Avisos fuera de la transacción (avisar no debe abortar una entrega ya hecha).
    const order = result.order;
    if (order.userId) {
      notifyUser({
        userId: order.userId,
        title: "🏠 ¡Llegamos!",
        body: "Tu pedido fue entregado. Disfrutalo — y no te olvides de calificar.",
        type: "order_status",
        orderId,
        link: `/orders/${orderId}`,
      }).catch(() => {});
    }
    if (order.storeOwnerId) {
      notifyUser({
        userId: order.storeOwnerId,
        title: "✅ Pedido entregado",
        body: `El pedido de ${order.customerName || "un cliente"} fue entregado con éxito.`,
        type: "order_status",
        orderId,
        link: `/orders/${orderId}`,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error confirmando entrega:", error);
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
