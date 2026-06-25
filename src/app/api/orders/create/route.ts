import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// ✅ CONFIGURACIÓN CENTRALIZADA DE PRECIO (Tinogasta)
const FIXED_SHIPPING_COST = 2000; 

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:create', 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { userId, items, shippingInfo, storeId, paymentMethod, customerCoords } = body;

    if (!userId || !items || !storeId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // 🔒 Idempotencia: evitar doble pedido por doble click / doble request
    const idempotencyKey = body.idempotencyKey as string | undefined;
    if (idempotencyKey) {
      const existing = await adminDb.collection("orders")
        .where("userId", "==", userId)
        .where("idempotencyKey", "==", idempotencyKey)
        .limit(1)
        .get();
      if (!existing.empty) {
        const existingOrder = existing.docs[0].data();
        console.log(`ℹ️ [API Segura] Pedido duplicado detectado: ${existingOrder.id}`);
        return NextResponse.json({ orderId: existingOrder.id, total: existingOrder.total, duplicate: true });
      }
    }

    console.log(`🛡️ [API Segura] Iniciando proceso para usuario: ${userId}`);

    // 1. Obtener la Tienda
    const storeDoc = await adminDb.collection("stores").doc(storeId).get();
    if (!storeDoc.exists) {
        return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }
    const storeData = storeDoc.data();

    // Defensa en profundidad: hasta ahora nada del lado servidor bloqueaba pedidos a una
    // tienda pausada/cerrada (solo era un filtro visual del cliente).
    if (storeData?.manuallyPaused) {
        return NextResponse.json({ error: "Esta tienda pausó temporalmente los pedidos." }, { status: 400 });
    }

    // Obtener configuración global
    const platformConfigSnap = await adminDb.collection("config").doc("platform").get();
    const platformConfig = platformConfigSnap.data() || {};
    // Usar 5% como default si no está configurado en Firestore (coherente con el cliente)
    const serviceFeePercent = platformConfig.serviceFee ?? 5;

    const storeCoords = storeData?.coords || storeData?.location || null;
    // Buscamos el ID del dueño para notificarle
    const ownerId = storeData?.ownerId || storeData?.userId;
    const newOrderRef = adminDb.collection("orders").doc();

    // 2. RE-CALCULAR EL TOTAL, VALIDAR STOCK Y DESCONTARLO — todo en una transacción para
    // que dos compradores comprando el último item al mismo tiempo no puedan sobrevender.
    // 🔐 El precio SIEMPRE se busca en Firestore — el precio que manda el cliente
    // se ignora por completo, solo se usan id y quantity. Así nadie puede pagar lo
    // que quiera por un producto manipulando el body del request.
    let calculatedSubtotal = 0;
    let shippingCost = FIXED_SHIPPING_COST;
    let serviceFeeAmount = 0;
    let finalTotal = 0;
    const verifiedItems: { id: string; title: string; price: number; quantity: number }[] = [];

    await adminDb.runTransaction(async (tx) => {
        calculatedSubtotal = 0;
        verifiedItems.length = 0;

        // Pasada 1: leer y validar TODOS los productos (las transacciones de Firestore
        // exigen que todas las lecturas pasen antes de cualquier escritura).
        const stockUpdates: { ref: FirebaseFirestore.DocumentReference; newStock: number }[] = [];

        for (const item of items) {
            const itemId = item.id;
            const rawQty = item.quantity ?? 1;
            const quantity = Number(rawQty);

            if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
                throw new Error(`Item inválido: ${itemId}`);
            }

            // Intentar en subcolección 'products' y luego 'items' por compatibilidad
            let productRef = adminDb.collection("stores").doc(storeId).collection("products").doc(itemId);
            let productSnap = await tx.get(productRef);
            if (!productSnap.exists) {
                productRef = adminDb.collection("stores").doc(storeId).collection("items").doc(itemId);
                productSnap = await tx.get(productRef);
            }

            if (!productSnap.exists) {
                throw new Error(`Producto no encontrado: ${itemId}`);
            }

            const productData = productSnap.data()!;
            const title = productData.name || productData.title || "Producto sin nombre";
            const price = Number(productData.price ?? productData.unit_price ?? 0);

            if (price <= 0 || isNaN(price)) {
                throw new Error(`Error de datos: El producto "${title}" tiene precio 0.`);
            }

            // Stock opcional: sin valor = sin límite, no rompe productos que nunca tuvieron este campo.
            if (productData.stock != null) {
                const currentStock = Number(productData.stock);
                if (currentStock < quantity) {
                    throw new Error(`"${title}" no tiene suficiente stock (quedan ${currentStock}).`);
                }
                stockUpdates.push({ ref: productRef, newStock: currentStock - quantity });
            }

            calculatedSubtotal += price * quantity;
            verifiedItems.push({ id: itemId, title, price, quantity });
        }

        if (calculatedSubtotal <= 0) {
            throw new Error("El subtotal del pedido es 0.");
        }

        // 3. Cálculos Finales
        shippingCost = FIXED_SHIPPING_COST;
        serviceFeeAmount = (calculatedSubtotal * serviceFeePercent) / 100;
        finalTotal = calculatedSubtotal + shippingCost + serviceFeeAmount;

        // Pasada 2: escrituras — descontar stock y crear la orden.
        for (const { ref, newStock } of stockUpdates) {
            tx.update(ref, { stock: newStock });
        }

        const orderData = {
            id: newOrderRef.id,
            userId,
            customerName: shippingInfo.name,
            items: verifiedItems,
            shippingInfo,
            storeId,
            storeName: storeData?.name || "Tienda",
            storeAddress: storeData?.address || "",
            storeOwnerId: ownerId || null,

            storeCoords: storeCoords,
            customerCoords: customerCoords || null,

            deliveryPersonId: null as string | null,
            readyForPickup: false,

            subtotal: calculatedSubtotal,
            deliveryFee: shippingCost,
            serviceFee: serviceFeeAmount,
            total: finalTotal,

            paymentMethod: paymentMethod || "mercadopago",
            paymentStatus: "pending_payment",
            status: "Pendiente de Confirmación",

            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),

            idempotencyKey: idempotencyKey || null,
            createdVia: "secure_api_v3"
        };

        tx.set(newOrderRef, orderData);
    });

    // 5. ✅ NOTIFICAR A LA TIENDA (Campana + Push)
    if (ownerId) {
        const notifTitle = "🔔 Nueva Solicitud";
        const notifBody = `Tienes un pedido nuevo de ${shippingInfo.name} ($${finalTotal}). Revisa el stock.`;

        // A. Escribir en Firestore (Para la Campanita dentro de la App)
        await adminDb.collection("notifications").add({
            userId: ownerId,
            title: notifTitle,
            body: notifBody,
            type: "order_request",
            orderId: newOrderRef.id,
            read: false,
            createdAt: Timestamp.now(),
            icon: "store"
        });

        // B. Enviar Push al Celular (Si tiene token)
        try {
            // Buscamos tokens del dueño
            const ownerUserDoc = await adminDb.collection("users").doc(ownerId).get();
            const ownerUserData = ownerUserDoc.data();
            
            // Recopilar tokens (string o array)
            let tokens: string[] = [];
            if (ownerUserData?.fcmToken && typeof ownerUserData.fcmToken === 'string') tokens.push(ownerUserData.fcmToken);
            if (ownerUserData?.fcmTokens && Array.isArray(ownerUserData.fcmTokens)) tokens.push(...ownerUserData.fcmTokens);
            tokens = [...new Set(tokens)]; // Únicos

            if (tokens.length > 0) {
                await adminMessaging.sendEachForMulticast({
                    tokens: tokens,
                    notification: {
                        title: notifTitle,
                        body: notifBody,
                    },
                    webpush: {
                        fcmOptions: { link: '/orders' }
                    },
                    data: {
                        url: '/orders',
                        orderId: newOrderRef.id
                    }
                });
                console.log(`🔔 Push de nuevo pedido enviado al dueño ${ownerId}`);
            }
        } catch (pushError) {
            console.error("Error enviando push al dueño:", pushError);
            // No fallamos la request si el push falla, solo lo logueamos
        }
    }

    console.log(`✅ [API Éxito] Orden ${newOrderRef.id} creada y notificada.`);

    return NextResponse.json({ orderId: newOrderRef.id, total: finalTotal });

  } catch (error: any) {
    console.error("❌ [API Error Global]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}