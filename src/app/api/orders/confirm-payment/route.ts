import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json();

        if (!orderId) {
            return NextResponse.json({ error: "Falta Order ID" }, { status: 400 });
        }

        console.log(`💳 Confirmando pago para orden: ${orderId}`);

        // 1. Referencia a la orden (Modo Dios - Admin SDK)
        const orderRef = adminDb.collection('orders').doc(orderId);
        
        // 2. Obtener datos actuales para notificar a la Tienda
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
             return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
        }
        const orderData = orderSnap.data();

        // 3. Actualizamos el estado
        await orderRef.update({ 
            status: 'En preparación',
            paymentStatus: 'paid', // Marca interna de pago exitoso
            paidAt: new Date().toISOString()
        });

        // 4. Notificar a la Tienda que ya pagaron (Push)
        const storeId = orderData?.storeId;
        if (storeId) {
             const storeDoc = await adminDb.collection('stores').doc(storeId).get();
             const ownerId = storeDoc.data()?.ownerId;

             if (ownerId) {
                 const userDoc = await adminDb.collection('users').doc(ownerId).get();
                 const token = userDoc.data()?.fcmToken;

                 if (token) {
                     await adminMessaging.send({
                        token: token,
                        notification: {
                            title: "💰 ¡Pago Recibido!",
                            body: `El pedido de ${orderData?.customerName} ha sido pagado. ¡A cocinar! 👨‍🍳`,
                        },
                        // URL para que la tienda vaya directo al pedido
                        data: {
                            url: `https://encomienda-ya-app.vercel.app/orders/${orderId}`
                        },
                        webpush: {
                            fcmOptions: {
                                link: `https://encomienda-ya-app.vercel.app/orders/${orderId}`
                            }
                        }
                     });
                 }
             }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error confirmando pago:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}