import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const CANCELABLE_STATUSES = ['Pendiente de Confirmación', 'Pendiente de Pago'];

export async function POST(request: Request) {
    try {
        const { orderId, userId } = await request.json();

        if (!orderId || !userId) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
        }

        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
        }

        const order = orderSnap.data()!;

        // Solo el comprador puede cancelar su propia orden
        if (order.userId !== userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        // Solo se puede cancelar en estados previos al pago
        if (!CANCELABLE_STATUSES.includes(order.status)) {
            return NextResponse.json({
                error: `No se puede cancelar un pedido en estado "${order.status}"`
            }, { status: 400 });
        }

        // Actualizar orden a Cancelado
        await orderRef.update({
            status: 'Cancelado',
            cancelledAt: Timestamp.now(),
            cancelledBy: 'buyer',
            updatedAt: Timestamp.now(),
        });

        const storeOwnerId = order.storeOwnerId;
        const notificationsRef = adminDb.collection('notifications');

        // Notificar al comprador
        await notificationsRef.add({
            userId,
            title: '🚫 Pedido cancelado',
            body: 'Tu pedido fue cancelado correctamente.',
            type: 'order_cancelled',
            orderId,
            read: false,
            createdAt: Timestamp.now(),
        });

        // Notificar a la tienda
        if (storeOwnerId) {
            await notificationsRef.add({
                userId: storeOwnerId,
                title: '❌ Pedido cancelado por el cliente',
                body: `El cliente ${order.customerName || ''} canceló el pedido #${orderId.substring(0, 6)}.`,
                type: 'order_cancelled',
                orderId,
                read: false,
                createdAt: Timestamp.now(),
            });

            // Push a la tienda si tiene token FCM
            try {
                const storeUserDoc = await adminDb.collection('users').doc(storeOwnerId).get();
                const storeUserData = storeUserDoc.data();
                let tokens: string[] = [];
                if (storeUserData?.fcmToken) tokens.push(storeUserData.fcmToken);
                if (Array.isArray(storeUserData?.fcmTokens)) tokens.push(...storeUserData.fcmTokens);
                tokens = [...new Set(tokens)];

                if (tokens.length > 0) {
                    await adminMessaging.sendEachForMulticast({
                        tokens,
                        notification: {
                            title: '❌ Pedido cancelado',
                            body: `${order.customerName || 'Un cliente'} canceló el pedido #${orderId.substring(0, 6)}.`,
                        },
                        webpush: { fcmOptions: { link: '/orders' } },
                        data: { url: '/orders', orderId },
                    });
                }
            } catch (e) {
                console.error('Error enviando push a tienda:', e);
            }
        }

        console.log(`✅ Orden ${orderId} cancelada por comprador ${userId}`);
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('❌ Error cancelando orden:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
