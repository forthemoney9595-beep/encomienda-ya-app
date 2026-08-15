import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { normalizeSchedule, getStoreOpenStatus, nowInArgentina } from "@/lib/store-hours";
import { isValidCoords } from "@/lib/geo";
import { deliveryDistanceMeters, computeDeliveryFee, isBeyondDeliveryLimit } from "@/lib/delivery-pricing";

// ✅ CONFIGURACIÓN CENTRALIZADA DE PRECIO (Tinogasta)
// Valor fallback si config/platform.deliveryFee no está configurado en Firestore
const DEFAULT_DELIVERY_FEE = 2000;

// Métodos de pago aceptados. A propósito NO incluye 'Efectivo': ver el chequeo más abajo.
const ALLOWED_PAYMENT_METHODS = ['mercadopago'];

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

    // 🔒 SOLO PAGO DIGITAL (decisión de producto, ago 2026).
    // La app nunca ofreció efectivo en el checkout (CheckoutDialog ni siquiera manda este
    // campo, así que cae en el default 'mercadopago'), pero la ruta aceptaba CUALQUIER
    // valor que viniera en el body. Un pedido en efectivo rompe el modelo de saldos:
    // el repartidor cobra el total en mano y, sin embargo, payout-service le acredita
    // el envío a él Y su parte a la tienda, con plata que la plataforma nunca recibió.
    // Mientras no exista rendición de efectivo, esto se rechaza en el servidor.
    if (paymentMethod && !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Método de pago no disponible. Solo se aceptan pagos digitales." },
        { status: 400 },
      );
    }

    // 🔒 Validar customerCoords (Fase RR): era el ÚNICO dato del body que se escribía
    // crudo sin validar tipo ni rango — un body manipulado podía guardar strings o
    // coordenadas imposibles y romper el mapa del repartidor. Se sanitiza a solo los
    // campos conocidos (latitude/longitude/accuracy).
    let safeCustomerCoords: { latitude: number; longitude: number; accuracy?: number } | null = null;
    if (customerCoords != null) {
      if (!isValidCoords(customerCoords)) {
        return NextResponse.json(
          { error: "Ubicación inválida. Volvé a marcar tu ubicación en el mapa." },
          { status: 400 },
        );
      }
      safeCustomerCoords = { latitude: customerCoords.latitude, longitude: customerCoords.longitude };
      const accuracy = (customerCoords as Record<string, unknown>).accuracy;
      if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
        safeCustomerCoords.accuracy = Math.round(accuracy);
      }
    }

    // 🔒 El uid del token tiene que ser el mismo userId que dice el body — si no, alguien
    // está intentando crear un pedido a nombre de otra persona.
    const callerUid = await verifyAuthToken(request);
    if (!callerUid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (callerUid !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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

    // 🔒 Tienda NO aprobada = NO recibe pedidos (Tanda A de la auditoría): la aprobación
    // del admin solo la escondía del inicio, pero por URL directa la tienda pendiente o
    // rechazada renderizaba con carrito y esta ruta le creaba pedidos igual.
    if (storeData?.isApproved !== true) {
        return NextResponse.json({ error: "Esta tienda todavía no está habilitada para recibir pedidos." }, { status: 400 });
    }

    // Defensa en profundidad: hasta ahora nada del lado servidor bloqueaba pedidos a una
    // tienda pausada/cerrada (solo era un filtro visual del cliente).
    if (storeData?.manuallyPaused) {
        return NextResponse.json({ error: "Esta tienda pausó temporalmente los pedidos." }, { status: 400 });
    }

    // También validamos el horario de atención server-side (antes solo era un filtro visual
    // del cliente; por API directa se podía pedir con la tienda cerrada). nowInArgentina()
    // porque Vercel corre en UTC.
    const openStatus = getStoreOpenStatus(normalizeSchedule(storeData), nowInArgentina());
    if (!openStatus.isOpen) {
        return NextResponse.json({ error: "La tienda está cerrada en este horario." }, { status: 400 });
    }

    // Obtener configuración global
    const platformConfigSnap = await adminDb.collection("config").doc("platform").get();
    const platformConfig = platformConfigSnap.data() || {};
    // Usar 5% como default si no está configurado en Firestore (coherente con el cliente)
    const serviceFeePercent = platformConfig.serviceFee ?? 5;

    // Comisión vigente para ESTA tienda en ESTE momento (la propia, o la global si no tiene
    // una cargada). Se guarda en el pedido para que el saldo no cambie retroactivamente si
    // después se edita la comisión — ver `commissionRate` en orderData más abajo.
    const storeCommission = storeData?.commissionRate;
    const commissionRateAtOrder: number =
        typeof storeCommission === 'number' && storeCommission > 0
            ? storeCommission
            : (typeof platformConfig.defaultCommissionRate === 'number' && platformConfig.defaultCommissionRate >= 0
                ? platformConfig.defaultCommissionRate
                : 10);

    const storeCoords = storeData?.coords || storeData?.location || null;

    // 🚧 Cerco anti-disparate + envío según distancia (Fase RR ter, delivery-pricing.ts).
    // La distancia es tienda→cliente en línea recta; sin coords de alguno de los dos se
    // cobra la base y no se rechaza nada (nunca castigar la falta de dato).
    const deliveryDistM = deliveryDistanceMeters(storeCoords, safeCustomerCoords);
    if (isBeyondDeliveryLimit(deliveryDistM, platformConfig)) {
      return NextResponse.json(
        { error: "Tu ubicación quedó muy lejos de la zona de entrega. Revisá el pin en el mapa — puede que el GPS haya marcado otro lugar." },
        { status: 400 },
      );
    }
    const shippingCost: number = computeDeliveryFee(deliveryDistM, platformConfig, DEFAULT_DELIVERY_FEE);

    // Buscamos el ID del dueño para notificarle
    const ownerId = storeData?.ownerId || storeData?.userId;
    const newOrderRef = adminDb.collection("orders").doc();

    // 2. RE-CALCULAR EL TOTAL, VALIDAR STOCK Y DESCONTARLO — todo en una transacción para
    // que dos compradores comprando el último item al mismo tiempo no puedan sobrevender.
    // 🔐 El precio SIEMPRE se busca en Firestore — el precio que manda el cliente
    // se ignora por completo, solo se usan id y quantity. Así nadie puede pagar lo
    // que quiera por un producto manipulando el body del request.
    let calculatedSubtotal = 0;
    let shippingCostVar = shippingCost; // uso la const del config leída arriba
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
            const catalogPrice = Number(productData.price ?? productData.unit_price ?? 0);

            if (catalogPrice <= 0 || isNaN(catalogPrice)) {
                throw new Error(`Error de datos: El producto "${title}" tiene precio 0.`);
            }

            // Descuento opcional (0-90%): se aplica acá al precio real, nunca se confía en
            // un precio ya descontado que mande el cliente (el carrito lo muestra, pero el
            // servidor vuelve a calcularlo desde el catálogo).
            const discountPercent = Number(productData.discountPercent) || 0;
            const price = discountPercent > 0 ? catalogPrice * (1 - discountPercent / 100) : catalogPrice;

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
        shippingCostVar = shippingCost;
        serviceFeeAmount = (calculatedSubtotal * serviceFeePercent) / 100;
        finalTotal = calculatedSubtotal + shippingCostVar + serviceFeeAmount;

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
            customerCoords: safeCustomerCoords,

            deliveryPersonId: null as string | null,
            readyForPickup: false,

            subtotal: calculatedSubtotal,
            deliveryFee: shippingCost,
            serviceFee: serviceFeeAmount,
            total: finalTotal,

            // 🔒 Comisión CONGELADA al momento del pedido. Antes el saldo se calculaba
            // siempre con la comisión ACTUAL de la tienda, así que cambiarla recalculaba
            // todo el histórico: subirla podía hacer que una tienda pasara a deber plata
            // por pedidos ya liquidados, y bajarla le regalaba saldo por ventas viejas.
            commissionRate: commissionRateAtOrder,
            // Monto de la comisión, para poder sumarlo server-side (aggregation) sin tener
            // que bajar los pedidos y recalcular con la tasa de cada tienda. Es lo que le
            // permite al dashboard mostrar el margen REAL de la plataforma.
            commissionAmount: calculatedSubtotal * (commissionRateAtOrder / 100),

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
    Sentry.captureException(error, { tags: { route: "orders/create" } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}