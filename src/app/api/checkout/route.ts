import { NextResponse } from 'next/server';
import MercadoPagoConfig, { Preference } from 'mercadopago';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    // 1. Verificar Token
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("❌ [Checkout API] Error: MP_ACCESS_TOKEN no definido");
        return NextResponse.json({ error: "Error de configuración del servidor (Token)" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });

    try {
        const body = await request.json();

        const { orderId, items, payerEmail, userId, storeId, storeOwnerId } = body;

        // 2. Validación básica
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "Items inválidos" }, { status: 400 });
        }
        if (!storeId || !orderId) {
            return NextResponse.json({ error: "Faltan storeId u orderId" }, { status: 400 });
        }

        // 🔐 Verificar precios reales contra Firestore — evita manipulación desde el cliente
        const verifiedItems: { id: string; title: string; quantity: number; unit_price: number }[] = [];
        for (const item of items) {
            const itemId = item.id;
            const requestedQty = Number(item.quantity);

            if (!itemId || requestedQty <= 0 || !Number.isInteger(requestedQty)) {
                return NextResponse.json({ error: `Item inválido: ${itemId}` }, { status: 400 });
            }

            // Intentar en subcolección 'products' y luego 'items' por compatibilidad
            let productSnap = await adminDb.collection("stores").doc(storeId).collection("products").doc(itemId).get();
            if (!productSnap.exists) {
                productSnap = await adminDb.collection("stores").doc(storeId).collection("items").doc(itemId).get();
            }

            if (!productSnap.exists) {
                console.error(`❌ [Checkout] Producto ${itemId} no encontrado en tienda ${storeId}`);
                return NextResponse.json({ error: `Producto no encontrado: ${itemId}` }, { status: 400 });
            }

            const productData = productSnap.data()!;
            const realPrice = Number(productData.price ?? productData.unit_price ?? 0);

            if (realPrice <= 0) {
                return NextResponse.json({ error: `Precio inválido para producto: ${itemId}` }, { status: 400 });
            }

            verifiedItems.push({
                id: itemId,
                title: productData.name || productData.title || 'Producto',
                quantity: requestedQty,
                unit_price: realPrice,
            });
        }

        console.log(`✅ [Checkout API] ${verifiedItems.length} item(s) verificados contra Firestore`);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

        const isLocalhost = baseUrl.includes("localhost");
        const notificationUrl = isLocalhost
            ? undefined
            : `${baseUrl}/api/webhooks/mercadopago`;

        // 3. Crear Preferencia
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: verifiedItems.map(item => ({
                    id: item.id,
                    title: item.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    currency_id: 'ARS',
                })),
                external_reference: orderId, 
                payer: {
                    email: payerEmail || 'test_user_encomiendaya@test.com'
                },
                // ⚠️ METADATA CRÍTICA: Aquí guardamos los IDs para el viaje de ida y vuelta
                metadata: {
                    order_id: orderId,
                    buyer_id: userId || 'unknown_user',
                    store_id: storeId || 'unknown_store',
                    store_owner_id: storeOwnerId || 'unknown_owner' // ✅ AGREGADO: El ID del dueño real
                },
                notification_url: notificationUrl,
                back_urls: {
                    success: `${baseUrl}/orders/${orderId}?status=success`,
                    failure: `${baseUrl}/orders/${orderId}?status=failure`,
                    pending: `${baseUrl}/orders/${orderId}?status=pending`,
                },
                auto_return: 'approved',
            }
        });

        const urlToReturn = result.init_point;

        // ⭐⭐ MARCA DE AGUA V3: Actualizada para confirmar el cambio
        console.log("⭐⭐ [Checkout API V3] URL Generada:", urlToReturn);
        
        return NextResponse.json({ url: urlToReturn });

    } catch (error: any) {
        console.error("❌ [Checkout API] Error Catch:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}