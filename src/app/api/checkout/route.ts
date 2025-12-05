import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const { userId, title, body, link } = await request.json();

        if (!userId || !title || !body) {
            return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
        }

        // 1. Buscamos el token del usuario
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
        }

        const userData = userDoc.data();
        const token = userData?.fcmToken;

        if (!token) {
            console.log(`🔕 El usuario ${userId} no tiene token FCM.`);
            return NextResponse.json({ message: "Usuario sin notificaciones activas" }, { status: 200 });
        }

        // 🔥 CORRECCIÓN: Construimos la URL Absoluta
        // Usamos la variable de entorno que configuramos en Vercel
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        // Si el link viene parcial (ej: /orders/123), le pegamos el dominio al principio.
        // Resultado: https://tu-app.vercel.app/orders/123
        const finalLink = link ? `${baseUrl}${link}` : `${baseUrl}/orders`;

        // 2. Enviamos el mensaje
        await adminMessaging.send({
            token: token,
            notification: {
                title: title,
                body: body,
            },
            webpush: {
                fcmOptions: {
                    link: finalLink // Ahora es un link completo y seguro
                },
                notification: {
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-72x72.png'
                }
            }
        });

        console.log(`🔔 Notificación enviada a ${userId} con link: ${finalLink}`);
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("❌ Error enviando Push:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}