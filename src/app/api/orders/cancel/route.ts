import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyAuthToken } from '@/lib/auth-server';

const CANCELABLE_STATUSES = ['Pendiente de Confirmación', 'Pendiente de Pago'];
// El admin puede cancelar más estados (excepto los terminales)
const ADMIN_CANCELABLE_STATUSES = ['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'Listo para recoger', 'En camino', 'En reparto'];

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(ip, 'orders:cancel', 10, 60_000);
    if (!allowed) {
        return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
    }

    try {
        const { orderId, userId } = await request.json();

        if (!orderId || !userId) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
        }

        // 🔒 Antes solo se chequeaba que el pedido fuera de ese userId -- pero nada probaba
        // que quien llama REALMENTE sea ese usuario. Ahora se verifica el ID token primero.
        const callerUid = await verifyAuthToken(request);
        if (!callerUid) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        // Verificar si el caller es admin (puede cancelar cualquier pedido)
        const adminDoc = await adminDb.collection('roles_admin').doc(callerUid).get();
        const isAdmin = adminDoc.exists;

        if (!isAdmin && callerUid !== userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
        }

        const order = orderSnap.data()!;

        if (!isAdmin && order.userId !== userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const allowedStatuses = isAdmin ? ADMIN_CANCELABLE_STATUSES : CANCELABLE_STATUSES;
        if (!allowedStatuses.includes(order.status)) {
            return NextResponse.json({
                error: `No se puede cancelar un pedido en estado "${order.status}"`
            }, { status: 400 });
        }

        // 🚨 Si el pedido YA ESTABA PAGADO, cancelarlo deja plata del comprador en poder de
        // la plataforma. Antes esto no dejaba ningún rastro: el pedido quedaba
        // `{status:'Cancelado', paymentStatus:'paid'}` y que se devolviera dependía de que
        // un humano se acordara. Ahora queda anotado como discrepancia pendiente, que es la
        // misma bandeja que el admin ya revisa (/admin/payment-issues).
        const wasPaid = order.paymentStatus === 'paid' && !order.refunded;
        if (wasPaid) {
            await adminDb.collection('payment_mismatches').add({
                orderId,
                paymentId: order.mpPaymentId || null,
                reason: 'cancelled_after_payment',
                paidAmount: Number(order.paidAmount ?? order.total) || 0,
                orderTotal: Number(order.total) || 0,
                orderStatus: order.status,
                cancelledBy: isAdmin ? 'admin' : 'buyer',
                createdAt: Timestamp.now(),
                resolved: false,
            });
        }

        await orderRef.update({
            status: 'Cancelado',
            cancelledAt: Timestamp.now(),
            cancelledBy: isAdmin ? 'admin' : 'buyer',
            updatedAt: Timestamp.now(),
            // Marca visible desde el propio pedido: hay plata para devolver.
            ...(wasPaid ? { hasPaymentIssue: true, paymentIssueReason: 'cancelled_after_payment' } : {}),
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
