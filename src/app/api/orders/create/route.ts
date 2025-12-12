import { NextResponse } from "next/server";
// ✅ Importamos adminMessaging para poder enviar Push
import { adminDb, adminMessaging } from "@/lib/firebase-admin"; 
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, items, shippingInfo, storeId, paymentMethod, customerCoords } = body;

    if (!userId || !items || !storeId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    console.log(`🛡️ [API Segura] Iniciando proceso para usuario: ${userId}`);

    // 1. Obtener la Tienda
    const storeDoc = await adminDb.collection("stores").doc(storeId).get();
    if (!storeDoc.exists) {
        return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }
    const storeData = storeDoc.data();
    
    // Obtener configuración global
    const platformConfigSnap = await adminDb.collection("config").doc("platform").get();
    const platformConfig = platformConfigSnap.data() || {};
    const serviceFeePercent = platformConfig.serviceFee || 0;

    // 2. RE-CALCULAR EL TOTAL Y SANITIZAR
    let calculatedSubtotal = 0;
    const verifiedItems = [];

    for (const item of items) {
        const rawPrice = item.price ?? item.unit_price ?? item.unitPrice ?? item.cost ?? 0;
        const price = Number(rawPrice);
        const quantity = Number(item.quantity || 1);
        const title = item.name || item.title || item.product?.name || "Producto sin nombre";

        if (price <= 0 || isNaN(price)) {
            console.error(`❌ ERROR FATAL: El producto "${title}" tiene precio inválido: ${rawPrice}`);
            return NextResponse.json({ error: `Error de datos: El producto "${title}" tiene precio 0.` }, { status: 400 });
        }

        calculatedSubtotal += price * quantity;

        verifiedItems.push({
            id: item.id,
            title: title,
            price: price,
            quantity: quantity,
            originalData: item 
        });
    }

    if (calculatedSubtotal <= 0) {
         return NextResponse.json({ error: "El subtotal del pedido es 0." }, { status: 400 });
    }

    // 3. Cálculos Finales
    const shippingCost = 5.00; 
    const serviceFeeAmount = (calculatedSubtotal * serviceFeePercent) / 100;
    const finalTotal = calculatedSubtotal + shippingCost + serviceFeeAmount;

    // 4. Crear la Orden en Firestore
    const newOrderRef = adminDb.collection("orders").doc();
    
    const storeCoords = storeData?.coords || storeData?.location || null;
    // Buscamos el ID del dueño para notificarle
    const ownerId = storeData?.ownerId || storeData?.userId; 

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
        
        createdVia: "secure_api_v3"
    };

    await newOrderRef.set(orderData);

    // 5. ✅ NOTIFICAR A LA TIENDA (Campana + Push)
    // ESTA ES LA PARTE QUE FALTABA EN TU ARCHIVO ANTERIOR
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