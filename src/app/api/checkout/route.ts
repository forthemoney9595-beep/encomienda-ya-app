import { NextResponse } from 'next/server';
import MercadoPagoConfig, { Preference } from 'mercadopago';

export async function POST(request: Request) {
    // 1. Verificar Token
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("❌ Error: MP_ACCESS_TOKEN no definido");
        return NextResponse.json({ error: "Error de configuración del servidor (Token)" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });

    try {
        const body = await request.json();
        console.log("📥 [Checkout API] Body recibido:", body); // Log en Vercel

        const { orderId, items, payerEmail } = body;

        // 2. Validación DETALLADA
        const missingData = [];
        if (!orderId) missingData.push("orderId");
        if (!items) missingData.push("items");
        else if (!Array.isArray(items)) missingData.push("items (no es array)");
        else if (items.length === 0) missingData.push("items (vacío)");

        if (missingData.length > 0) {
            console.error("❌ Faltan datos:", missingData);
            // Devolvemos el error con detalles para verlo en la consola del navegador
            return NextResponse.json({ 
                error: "Datos incompletos", 
                details: missingData,
                received: body 
            }, { status: 400 });
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
                // auto_return desactivado para evitar errores de validación estricta de MP
                // auto_return: 'approved', 
            }
        });

        console.log("✅ [Checkout API] Preferencia creada:", result.init_point);
        return NextResponse.json({ url: result.init_point });

    } catch (error: any) {
        console.error("❌ [Checkout API] Error Catch:", error);
        return NextResponse.json({ 
            error: "Error interno al procesar pago", 
            message: error.message 
        }, { status: 500 });
    }
}