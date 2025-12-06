import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json();

        if (!orderId) {
            return NextResponse.json({ error: "Falta Order ID" }, { status: 400 });
        }

        console.log(`💳 Confirmando pago para orden: ${orderId}`);

        // 1. Usamos adminDb (Modo Dios) para saltarnos las reglas de seguridad
        const orderRef = adminDb.collection('orders').doc(orderId);
        
        // 2. Actualizamos el estado
        await orderRef.update({ 
            status: 'En preparación',
            paymentStatus: 'paid', // Opcional: marca interna
            paidAt: new Date().toISOString()
        });

        // 3. (Opcional) Podrías notificar a la tienda aquí de nuevo que "Ya está pagado"
        // Pero el cambio de estado ya dispara la notificación en el frontend si alguien está mirando.

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error confirmando pago:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}