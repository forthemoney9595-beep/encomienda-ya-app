import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyStoreOwnership } from "@/lib/auth-server";
import { zeroStockForItems } from "@/lib/stock-service";

// Fallback si config/platform.deliveryFee no está configurado (mismo default que
// /api/orders/create).
const DEFAULT_DELIVERY_FEE = 2000;

// Reemplaza al "Tengo Stock" todo-o-nada: la tienda puede confirmar el pedido sacando
// ítems puntuales sin stock.
//
// 🔒 El total SIEMPRE se recalcula acá releyendo el precio del CATÁLOGO, nunca del array
// `items` de la orden. Antes se confiaba en `item.price` del documento asumiendo que era
// "el precio ya verificado al crear la orden" — pero la regla de Firestore le permitía al
// comprador reescribir ese array, así que podía bajarse el precio y confirmar un pedido de
// $20.000 a $2.000. La regla ya no lo permite (ver firestore.rules), y esto es la segunda
// barrera: aunque alguien lograra alterar `items`, el precio cobrado sale del catálogo.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:confirm-stock', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { orderId, storeId, removedItemIds } = body;

    if (!orderId || !storeId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // 🔒 Solo el dueño real de la tienda (probado por su token + stores/{id}.ownerId)
    // puede confirmar stock de sus pedidos -- antes alcanzaba con mandar cualquier storeId.
    const callerUid = await verifyAuthToken(request);
    if (!callerUid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!(await verifyStoreOwnership(callerUid, storeId))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const removedIds: string[] = Array.isArray(removedItemIds) ? removedItemIds : [];

    // Ajustes de cantidad, SOLO reducciones (caso real de la prueba, 16/8: "me piden 4
    // pizzas y tengo para hacer 2" — antes la única opción era sacar el renglón entero o
    // que el cliente cancelara todo el pedido). itemId -> cantidad nueva (entero >= 1 y
    // MENOR a la pedida; aumentar está prohibido: saltearía la validación de stock que
    // hizo /api/orders/create al reservar).
    const adjustedQuantities: Record<string, unknown> =
      body.adjustedQuantities && typeof body.adjustedQuantities === 'object' && !Array.isArray(body.adjustedQuantities)
        ? body.adjustedQuantities
        : {};

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const orderData = orderSnap.data()!;

    if (orderData.storeId !== storeId) {
      return NextResponse.json({ error: "Este pedido no pertenece a tu tienda." }, { status: 403 });
    }
    if (orderData.status !== "Pendiente de Confirmación") {
      return NextResponse.json({ error: "Este pedido ya no está pendiente de confirmación." }, { status: 400 });
    }

    const originalItems: any[] = orderData.items || [];
    const removedItems = originalItems.filter((it) => removedIds.includes(it.id));
    const keptItems = originalItems.filter((it) => !removedIds.includes(it.id));

    if (keptItems.length === 0) {
      return NextResponse.json({ error: "No se puede confirmar un pedido sin productos. Rechazalo en su lugar." }, { status: 400 });
    }

    const platformConfigSnap = await adminDb.collection("config").doc("platform").get();
    const platformConfig = platformConfigSnap.data() || {};
    const serviceFeePercent = platformConfig.serviceFee ?? 5;
    // El envío sale de config (o del que ya tenía la orden), NO de una constante. Antes
    // estaba hardcodeado en 2000 mientras `create` lo leía de config: si el admin cambiaba
    // la tarifa, el `total` se recalculaba con 2000 pero el campo `deliveryFee` quedaba con
    // el valor de config -> `subtotal + deliveryFee + serviceFee != total`, el checkout
    // cobraba un monto distinto y el webhook lo marcaba como discrepancia (pago trabado).
    const deliveryFee = Number(orderData.deliveryFee ?? platformConfig.deliveryFee ?? DEFAULT_DELIVERY_FEE);

    // 🔒 Precio SIEMPRE del catálogo, nunca del array `items` de la orden (ver comentario
    // de arriba). Mismo criterio y mismo orden de subcolecciones que /api/orders/create.
    const pricedItems: any[] = [];
    const adjustedItems: { id: string; title: string; from: number; to: number }[] = [];
    for (const it of keptItems) {
      const orderedQty = Number(it.quantity) || 0;
      if (!it.id || orderedQty <= 0) {
        return NextResponse.json({ error: `Ítem inválido en el pedido: ${it.id || '(sin id)'}` }, { status: 400 });
      }

      // Aplicar el ajuste de cantidad si vino (validado: entero, >=1, < pedida).
      let quantity = orderedQty;
      if (adjustedQuantities[it.id] !== undefined) {
        const adj = Number(adjustedQuantities[it.id]);
        if (!Number.isInteger(adj) || adj < 1 || adj > orderedQty) {
          return NextResponse.json(
            { error: `Ajuste inválido para "${it.title || it.name || it.id}": solo se puede reducir la cantidad (mínimo 1).` },
            { status: 400 },
          );
        }
        if (adj < orderedQty) {
          quantity = adj;
          adjustedItems.push({ id: it.id, title: it.title || it.name || 'Producto', from: orderedQty, to: adj });
        }
      }

      let productSnap = await adminDb.collection("stores").doc(storeId).collection("products").doc(it.id).get();
      if (!productSnap.exists) {
        productSnap = await adminDb.collection("stores").doc(storeId).collection("items").doc(it.id).get();
      }
      if (!productSnap.exists) {
        return NextResponse.json(
          { error: `El producto "${it.title || it.name || it.id}" ya no existe en tu catálogo. Sacalo del pedido para confirmarlo.` },
          { status: 400 },
        );
      }

      const p = productSnap.data()!;
      const catalogPrice = Number(p.price ?? p.unit_price ?? 0);
      if (!(catalogPrice > 0)) {
        return NextResponse.json({ error: `El producto "${p.name || p.title || it.id}" tiene precio inválido.` }, { status: 400 });
      }
      const discountPercent = Number(p.discountPercent) || 0;
      const price = discountPercent > 0 ? catalogPrice * (1 - discountPercent / 100) : catalogPrice;

      pricedItems.push({ ...it, price, quantity, title: p.name || p.title || it.title || 'Producto' });
    }

    const newSubtotal = pricedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const newServiceFee = (newSubtotal * serviceFeePercent) / 100;
    const newTotal = newSubtotal + deliveryFee + newServiceFee;

    await orderRef.update({
      items: pricedItems,
      subtotal: newSubtotal,
      serviceFee: newServiceFee,
      deliveryFee,
      total: newTotal,
      status: "Pendiente de Pago",
      updatedAt: Timestamp.now(),
      // commissionAmount congelado al crear: si el subtotal cambió (ítems sacados), hay
      // que recalcularlo -- era el único campo de plata que quedaba viejo acá, y el
      // desglose del dashboard admin lo suma tal cual (Fase PP, N7). Las fórmulas de
      // pago no lo usan (recalculan desde subtotal), por eso nunca pagó mal.
      ...(typeof orderData.commissionRate === 'number'
        ? { commissionAmount: newSubtotal * orderData.commissionRate / 100 }
        : {}),
      ...(removedItems.length > 0 ? { removedItems } : {}),
      ...(adjustedItems.length > 0 ? { adjustedItems } : {}),
    });

    // La tienda dijo "no tengo esto" (sacado) o "no tengo MÁS que esto" (reducido): el
    // stock de esos productos va a 0, no vuelve al número que acaba de desmentir. Si
    // volviera, el catálogo los ofrecería otra vez y el próximo cliente chocaría con la
    // misma falta. La tienda lo corrige al reponer. (Decisión de producto, Fase MM.)
    const outOfStockItems = [
      ...removedItems,
      ...originalItems.filter((it) => adjustedItems.some((a) => a.id === it.id)),
    ];
    if (outOfStockItems.length > 0) {
      const { zeroed } = await zeroStockForItems(storeId, outOfStockItems);
      if (zeroed.length > 0) {
        console.log(`Stock puesto en 0 para ${zeroed.length} producto(s) sin existencia: ${zeroed.join(', ')}`);
      }
    }

    // Notificar al comprador qué cambió (si algo cambió) y el nuevo total.
    const hasChanges = removedItems.length > 0 || adjustedItems.length > 0;
    const changeParts: string[] = [];
    if (removedItems.length > 0) {
      changeParts.push(`no tenía: ${removedItems.map((it) => it.title || it.name).join(", ")}`);
    }
    if (adjustedItems.length > 0) {
      changeParts.push(`ajustó cantidades: ${adjustedItems.map((a) => `${a.title} ${a.from}→${a.to}`).join(", ")}`);
    }
    const notifTitle = hasChanges ? "⚠️ Pedido confirmado con cambios" : "✅ Stock Confirmado";
    const notifBody = hasChanges
      ? `La tienda ${changeParts.join(" y ")}. Nuevo total: $${newTotal.toFixed(0)}. Ya puedes pagar.`
      : "Puedes proceder al pago.";

    await adminDb.collection("notifications").add({
      userId: orderData.userId,
      title: notifTitle,
      body: notifBody,
      type: "order_status",
      orderId,
      read: false,
      createdAt: Timestamp.now(),
      icon: "store",
    });

    try {
      const buyerDoc = await adminDb.collection("users").doc(orderData.userId).get();
      const buyerData = buyerDoc.data();
      let tokens: string[] = [];
      if (buyerData?.fcmToken && typeof buyerData.fcmToken === "string") tokens.push(buyerData.fcmToken);
      if (buyerData?.fcmTokens && Array.isArray(buyerData.fcmTokens)) tokens.push(...buyerData.fcmTokens);
      tokens = [...new Set(tokens)];

      if (tokens.length > 0) {
        await adminMessaging.sendEachForMulticast({
          tokens,
          notification: { title: notifTitle, body: notifBody },
          webpush: { fcmOptions: { link: `/orders/${orderId}` } },
          data: { url: `/orders/${orderId}`, orderId },
        });
      }
    } catch (pushError) {
      console.error("Error enviando push de confirmación al comprador:", pushError);
    }

    return NextResponse.json({ success: true, total: newTotal, removedCount: removedItems.length, adjustedCount: adjustedItems.length });
  } catch (error: any) {
    console.error("❌ Error confirmando stock:", error);
    Sentry.captureException(error, { tags: { route: "orders/confirm-stock" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
