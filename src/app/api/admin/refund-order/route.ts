import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";

// Registra un reembolso/compensación sobre un pedido.
// Nota: NO transfiere plata por sí solo -- deja registro del reembolso, marca el pedido
// y notifica al comprador. La devolución real la hace el admin desde MercadoPago (mismo
// criterio que los retiros a tiendas/repartidores, que también son transferencias manuales).
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:refund-order', 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Registra un reembolso (plata real) -- exige admin de nivel 'full', no alcanza con 'support'.
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const { orderId, amount, reason, operationRef } = await request.json();
    if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "Monto de reembolso inválido" }, { status: 400 });
    }

    // Mismo criterio que aprobar un retiro: la devolución se hace POR FUERA (MercadoPago),
    // así que sin el número de operación no hay forma de demostrar que se hizo si el
    // comprador reclama. Antes se registraba el reembolso "a ciegas" y se le avisaba al
    // cliente que ya estaba procesado, aunque nadie hubiera devuelto nada todavía.
    const opRef = String(operationRef || '').trim();
    if (opRef.length < 4) {
      return NextResponse.json(
        { error: "Falta el número de operación de la devolución en MercadoPago." },
        { status: 400 },
      );
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

    const order = orderSnap.data()!;

    if (order.refunded) {
      return NextResponse.json({ error: "Este pedido ya tiene un reembolso registrado." }, { status: 400 });
    }
    if (numAmount > (order.total || 0) + 1) {
      return NextResponse.json({ error: `El reembolso ($${numAmount}) supera el total del pedido ($${order.total}).` }, { status: 400 });
    }

    // Registrar el reembolso
    await adminDb.collection('refunds').add({
      orderId,
      buyerId: order.userId,
      storeId: order.storeId || null,
      amount: numAmount,
      reason: reason || '',
      operationRef: opRef,
      adminUid: callerUid,
      createdAt: Timestamp.now(),
    });

    // Marcar el pedido
    await orderRef.update({
      refunded: true,
      refundAmount: numAmount,
      refundReason: reason || '',
      refundOperationRef: opRef,
      refundedBy: callerUid,
      refundedAt: Timestamp.now(),
    });

    // Notificar al comprador (campanita)
    if (order.userId) {
      await adminDb.collection('notifications').add({
        userId: order.userId,
        title: '💸 Reembolso enviado',
        // El texto habla del dinero YA devuelto por MercadoPago (el admin no puede
        // registrar el reembolso sin el número de operación), y avisa que la acreditación
        // depende del medio de pago -- no promete que el dinero ya esté en la cuenta.
        body: `Devolvimos $${numAmount.toLocaleString()} de tu pedido. Puede tardar unos días en verse acreditado según tu medio de pago.${reason ? ` Motivo: ${reason}` : ''}`,
        type: 'refund',
        orderId,
        read: false,
        createdAt: Timestamp.now(),
      });

      // Push si tiene token
      try {
        const buyerDoc = await adminDb.collection('users').doc(order.userId).get();
        const bd = buyerDoc.data();
        const tokens: string[] = [];
        if (bd?.fcmToken) tokens.push(bd.fcmToken);
        if (Array.isArray(bd?.fcmTokens)) tokens.push(...bd.fcmTokens);
        const uniq = [...new Set(tokens)];
        if (uniq.length > 0) {
          await adminMessaging.sendEachForMulticast({
            tokens: uniq,
            notification: { title: '💸 Reembolso enviado', body: `Devolvimos $${numAmount.toLocaleString()} de tu pedido.` },
            webpush: { fcmOptions: { link: `/orders/${orderId}` } },
          }).catch(() => {});
        }
      } catch { /* noop */ }
    }

    return NextResponse.json({ success: true, amount: numAmount });
  } catch (error: any) {
    console.error("❌ Error registrando reembolso:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
