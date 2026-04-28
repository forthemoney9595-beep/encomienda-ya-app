import { NextResponse } from 'next/server';

// Este endpoint fue eliminado por razones de seguridad.
// La confirmación de pago se maneja exclusivamente via webhook de MercadoPago
// en /api/webhooks/mercadopago, que verifica la firma HMAC antes de actualizar la orden.
export async function POST() {
    return NextResponse.json(
        { error: 'Este endpoint fue deprecado. La confirmación de pago la maneja el webhook de MercadoPago.' },
        { status: 410 }
    );
}
