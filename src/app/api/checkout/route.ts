import { NextResponse } from 'next/server';
import MercadoPagoConfig, { Preference } from 'mercadopago';

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
        console.log("📥 [Checkout API] Body recibido:", body);

        // ✅ AGREGADO: Recibimos storeOwnerId para pasarlo a la metadata
        const { orderId, items, payerEmail, userId, storeId, storeOwnerId } = body; 

        // 2. Validación
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "Items inválidos" }, { status: 400 });
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        
        // Configuración de Webhook
        const isLocalhost = baseUrl.includes("localhost");
        const notificationUrl = isLocalhost 
            ? undefined 
            : `${baseUrl}/api/webhooks/mercadopago`;

        console.log("🔗 [Checkout API] Notification URL configurada:", notificationUrl);

        // 3. Crear Preferencia
        const preference = new Preference(client);
        
        const result = await preference.create({
            body: {
                items: items.map((item: any) => ({
                    id: item.id || 'item-id',
                    title: item.name || 'Producto',
                    quantity: Number(item.quantity),
                    unit_price: Number(item.price),
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