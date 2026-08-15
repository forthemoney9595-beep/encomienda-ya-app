import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { logAdminActionServer } from "@/lib/admin-audit-server";

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
    const { orderId, amount, reason, operationRef, claimId } = await request.json();
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

    // Si el reembolso sale de un reclamo del comprador (Fase NN), se validan y linkean
    // los dos registros ANTES de escribir nada: el reclamo queda resuelto como
    // 'refunded' en la misma request que registra la plata.
    let claimRef = null as FirebaseFirestore.DocumentReference | null;
    if (claimId) {
      claimRef = adminDb.collection('claims').doc(String(claimId));
      const claimSnap = await claimRef.get();
      if (!claimSnap.exists) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
      const claim = claimSnap.data()!;
      if (claim.orderId !== orderId) {
        return NextResponse.json({ error: "El reclamo no corresponde a este pedido." }, { status: 400 });
      }
      if (claim.resolved === true) {
        return NextResponse.json({ error: "Este reclamo ya fue resuelto." }, { status: 400 });
      }
    }

    // Registrar el reembolso + resolver el reclamo + marcar el pedido — TODO en UNA
    // transacción (Tanda A de la auditoría): antes era read-then-write suelto y dos
    // requests simultáneas podían registrar DOS reembolsos del mismo pedido. El re-chequeo
    // de `refunded` adentro de la transacción hace imposible el doble registro.
    const refundRef = adminDb.collection('refunds').doc();
    try {
      await adminDb.runTransaction(async (tx) => {
        const freshOrder = await tx.get(orderRef);
        if (!freshOrder.exists || freshOrder.data()!.refunded) {
          throw new Error('__ALREADY_REFUNDED__');
        }
        if (claimRef) {
          const freshClaim = await tx.get(claimRef);
          if (!freshClaim.exists || freshClaim.data()!.resolved === true) {
            throw new Error('__CLAIM_RESOLVED__');
          }
          tx.update(claimRef, {
            resolved: true,
            resolution: 'refunded',
            resolutionNote: `Reembolso de $${numAmount.toLocaleString('es-AR')} · op ${opRef}`,
            refundId: refundRef.id,
            resolvedAt: Timestamp.now(),
            resolvedBy: callerUid,
          });
        }
        tx.set(refundRef, {
          orderId,
          buyerId: order.userId,
          storeId: order.storeId || null,
          amount: numAmount,
          reason: reason || '',
          operationRef: opRef,
          adminUid: callerUid,
          ...(claimRef ? { claimId: claimRef.id } : {}),
          createdAt: Timestamp.now(),
        });
        tx.update(orderRef, {
          refunded: true,
          refundAmount: numAmount,
          refundReason: reason || '',
          refundOperationRef: opRef,
          refundedBy: callerUid,
          refundedAt: Timestamp.now(),
        });
      });
    } catch (e: any) {
      if (e?.message === '__ALREADY_REFUNDED__') {
        return NextResponse.json({ error: "Este pedido ya tiene un reembolso registrado." }, { status: 400 });
      }
      if (e?.message === '__CLAIM_RESOLVED__') {
        return NextResponse.json({ error: "Este reclamo ya fue resuelto." }, { status: 400 });
      }
      throw e;
    }

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

    // Auditoría en la misma request que registra el reembolso (antes la escribía el
    // cliente después; si fallaba, el reembolso quedaba sin autor).
    await logAdminActionServer(
      callerUid, 'refund_order', orderId,
      `${numAmount.toLocaleString('es-AR')} · op ${opRef}${reason ? ' — ' + reason : ''}`,
    );

    return NextResponse.json({ success: true, amount: numAmount });
  } catch (error: any) {
    console.error("❌ Error registrando reembolso:", error);
    Sentry.captureException(error, { tags: { route: "admin/refund-order" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
