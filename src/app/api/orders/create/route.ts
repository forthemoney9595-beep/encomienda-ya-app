import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, items, shippingInfo, storeId, paymentMethod, customerCoords } = body; // ✅ Agregamos customerCoords

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
    
    // ✅ LÓGICA GPS: Intentamos obtener coordenadas
    // A) Tienda: Sacamos las coordenadas del perfil de la tienda (si existen)
    const storeCoords = storeData?.coords || storeData?.location || null;
    
    // B) Cliente: Usamos las que envió el front o null (El mapa necesita ambas para trazar ruta)
    // Si no hay coordenadas de cliente, el mapa mostrará error o solo la tienda.
    
    const orderData = {
        id: newOrderRef.id,
        userId,
        customerName: shippingInfo.name,
        items: verifiedItems,
        shippingInfo,
        storeId,
        storeName: storeData?.name || "Tienda",
        storeAddress: storeData?.address || "",
        storeOwnerId: storeData?.userId || null, 
        
        // 📍 COORDENADAS PARA EL MAPA
        storeCoords: storeCoords, 
        customerCoords: customerCoords || null, // Recibido del body
        
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

    console.log(`✅ [API Éxito] Orden ${newOrderRef.id} creada con GPS.`);

    return NextResponse.json({ orderId: newOrderRef.id, total: finalTotal });

  } catch (error: any) {
    console.error("❌ [API Error Global]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}