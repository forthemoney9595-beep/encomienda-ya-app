import { NextResponse } from 'next/server';
import MercadoPagoConfig, { Preference } from 'mercadopago';

export async function POST(request: Request) {
    // 1. Verificar Token
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("❌ Error: MP_ACCESS_TOKEN no definido");
        return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });

    try {
        const body = await request.json();
        
        // --- LOGS DE DIAGNÓSTICO ---
        console.log("📥 [Checkout API] Recibido:", JSON.stringify(body, null, 2));
        // ---------------------------

        const { orderId, items, payerEmail } = body;

        // 2. Validación Estricta
        if (!orderId) {
            return NextResponse.json({ error: "Falta el ID de la orden (orderId)" }, { status: 400 });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "Faltan los productos (items)" }, { status: 400 });
        }

        // Definimos URL base (Producción o Local)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

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
                    email: payerEmail || 'test_user_123@testuser.com'
                },
                back_urls: {
                    success: `${baseUrl}/orders/${orderId}?status=success`,
                    failure: `${baseUrl}/orders/${orderId}?status=failure`,
                    pending: `${baseUrl}/orders/${orderId}?status=pending`,
                },
                // auto_return desactivado para evitar errores de localhost
                // auto_return: 'approved',
            }
        });

        console.log("✅ [Checkout API] Preferencia creada:", result.init_point);
        return NextResponse.json({ url: result.init_point });

    } catch (error: any) {
        console.error("❌ [Checkout API] Error:", error);
        return NextResponse.json({ error: error.message || "Error desconocido" }, { status: 500 });
    }
}