import { NextResponse } from 'next/server';
import MercadoPagoConfig, { Preference } from 'mercadopago';
import { adminDb } from '@/lib/firebase-admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(ip, 'checkout', 5, 60_000);
    if (!allowed) {
        return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
    }

    // 1. Verificar Token
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("❌ [Checkout API] Error: MP_ACCESS_TOKEN no definido");
        return NextResponse.json({ error: "Error de configuración del servidor (Token)" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });

    try {
        const body = await request.json();

        const { orderId, payerEmail } = body;

        // 2. Validación básica
        if (!orderId) {
            return NextResponse.json({ error: "Falta orderId" }, { status: 400 });
        }

        // 🔐 Obtener todos los datos del pedido desde Firestore — nunca del cliente.
        // La orden ya quedó creada (y sus precios verificados) por /api/orders/create,
        // así que acá reusamos ese mismo subtotal/envío/tarifa en vez de recalcular
        // de nuevo — evita que MercadoPago cobre de menos que order.total.
        const orderSnap = await adminDb.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
        }
        const orderData = orderSnap.data()!;
        const storeId: string = orderData.storeId;
        const storeOwnerId: string = orderData.storeOwnerId || orderData.storeId;
        const userId: string = orderData.userId;

        if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
            return NextResponse.json({ error: "El pedido no tiene items" }, { status: 400 });
        }

        const mpItems: { id: string; title: string; quantity: number; unit_price: number; currency_id: string }[] =
            orderData.items.map((item: any) => ({
                id: item.id,
                title: item.title || item.name || 'Producto',
                quantity: Number(item.quantity) || 1,
                unit_price: Number(item.price ?? item.unit_price ?? 0),
                currency_id: 'ARS',
            }));

        if (orderData.deliveryFee > 0) {
            mpItems.push({
                id: 'shipping',
                title: 'Envío',
                quantity: 1,
                unit_price: Number(orderData.deliveryFee),
                currency_id: 'ARS',
            });
        }

        if (orderData.serviceFee > 0) {
            mpItems.push({
                id: 'service-fee',
                title: 'Tarifa de servicio',
                quantity: 1,
                unit_price: Number(orderData.serviceFee),
                currency_id: 'ARS',
            });
        }

        console.log(`✅ [Checkout API] ${mpItems.length} item(s) tomados de la orden ${orderId} (incluye envío y tarifa de servicio)`);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

        const isLocalhost = baseUrl.includes("localhost");
        const notificationUrl = isLocalhost
            ? undefined
            : `${baseUrl}/api/webhooks/mercadopago`;

        // 3. Crear Preferencia
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: mpItems,
                external_reference: orderId,
                payer: {
                    email: payerEmail || 'test_user_encomiendaya@test.com'
                },
                metadata: {
                    order_id: orderId,
                    buyer_id: userId,
                    store_id: storeId,
                    store_owner_id: storeOwnerId,
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
        console.log(`✅ [Checkout API] Preferencia creada para orden ${orderId}`);
        return NextResponse.json({ url: urlToReturn });

    } catch (error: any) {
        console.error("❌ [Checkout API] Error Catch:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}