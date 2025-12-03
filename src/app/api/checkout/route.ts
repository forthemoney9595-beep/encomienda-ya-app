import { NextResponse } from 'next/server';
import MercadoPagoConfig, { Preference } from 'mercadopago';

export async function POST(request: Request) {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        return NextResponse.json({ error: "Error de configuración interna" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });

    try {
        const body = await request.json();
        const { orderId, items, payerEmail } = body;

        if (!orderId || !items || items.length === 0) {
            return NextResponse.json({ error: "Datos faltantes" }, { status: 400 });
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

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
                // ❌ COMENTAMOS ESTA LÍNEA PARA EVITAR EL ERROR
                // auto_return: 'approved', 
            }
        });

        return NextResponse.json({ url: result.init_point });

    } catch (error: any) {
        console.error("❌ ERROR MP:", error); 
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}