import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notify-server";
import { logAdminActionServer } from "@/lib/admin-audit-server";
import { broadcastOrderToDrivers } from "@/lib/driver-broadcast";

// ============================================================================
// 🧪 SOLO PARA LA GRAN PRUEBA PRE-LANZAMIENTO — SACAR ANTES DE LANZAR
// ============================================================================
// Simula la aprobación de un pago de MercadoPago para poder recorrer el circuito
// completo (preparación → retiro → entrega → billeteras) sin pagar de verdad.
// Replica EXACTAMENTE lo que escribe /api/webhooks/mercadopago al aprobar:
// mismos campos, misma guarda de estado, mismas notificaciones.
//
// Precauciones (por qué esto no es un agujero mientras exista):
//   - Exige token válido de admin nivel 'full' (mismo gate que reembolsar).
//   - Solo procesa órdenes en "Pendiente de Pago" y nunca dos veces.
//   - NO escribe mpPaymentId → la conciliación diaria con MP la saltea
//     (rama "unverifiable"), no genera discrepancias falsas.
//   - Marca `simulatedPayment: true` → la limpieza pre-lanzamiento las
//     encuentra todas con where('simulatedPayment','==',true).
//   - Deja registro en el Log de Acciones (approve_test_payment).
//
// Está anotado en CLAUDE.md → "Pendientes pre-lanzamiento": borrar esta ruta
// y el botón de /admin/orders antes de abrir a usuarios reales.
// ============================================================================

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "admin:approve-test-payment", 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  try {
    const callerUid = await verifyAuthToken(request);
    if (!callerUid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!(await verifyFullAdmin(callerUid))) {
      return NextResponse.json({ error: "Solo un admin completo puede aprobar pagos de prueba." }, { status: 403 });
    }

    const { orderId } = await request.json();
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Falta orderId" }, { status: 400 });
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "El pedido no existe." }, { status: 404 });
    }
    const order = orderSnap.data()!;

    // Mismas guardas que el webhook real.
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ error: "El pedido ya está pagado." }, { status: 400 });
    }
    if (order.status !== "Pendiente de Pago") {
      return NextResponse.json(
        { error: `El pedido está "${order.status}" — solo se puede aprobar un pago en "Pendiente de Pago".` },
        { status: 400 },
      );
    }

    const paidAmount = Number(order.total) || 0;

    // Mismos campos que el webhook (SIN mpPaymentId, ver cabecera) + marcador de prueba.
    await orderRef.set(
      {
        paymentStatus: "paid",
        status: "En preparación",
        paidAmount,
        paidAt: new Date(),
        updatedAt: new Date(),
        readyForPickup: false,
        simulatedPayment: true,
      },
      { merge: true },
    );

    // Mismas notificaciones que el webhook (campanita + push vía notifyUser).
    const storeUser = order.storeOwnerId || order.storeId;
    if (storeUser) {
      await notifyUser({
        userId: storeUser,
        title: "¡Pago Confirmado! 💰",
        body: `Orden #${orderId.substring(0, 6)} pagada por $${paidAmount}. A cocinar.`,
        type: "order_paid",
        link: "/orders",
        orderId,
      });
    }
    if (order.userId) {
      await notifyUser({
        userId: order.userId,
        title: "Pago Recibido ✅",
        body: "Tu pago se acreditó y la tienda ya está preparando tu pedido.",
        type: "payment_success",
        link: `/orders/${orderId}`,
        orderId,
      });
    }

    // Broadcast a repartidores (Fase RR bis) — igual que el webhook real: el pedido
    // entra al pool de "Disponibles" en este momento, así que el aviso sale solo.
    try {
      await broadcastOrderToDrivers({
        orderId,
        title: "📦 Nuevo Pedido Disponible",
        body: `${order.storeName || "Una tienda"} tiene un pedido pagado para entregar. ¡Tomalo!`,
      });
    } catch (e) {
      console.error("[approve-test-payment] broadcast falló:", e);
    }

    await logAdminActionServer(
      callerUid,
      "approve_test_payment",
      orderId,
      `Pago de PRUEBA aprobado por $${paidAmount} (${order.storeName || "?"} / ${order.customerName || "?"})`,
    );

    return NextResponse.json({ ok: true, orderId, paidAmount });
  } catch (error: any) {
    console.error("[approve-test-payment] error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
