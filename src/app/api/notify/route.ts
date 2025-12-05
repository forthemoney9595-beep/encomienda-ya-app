import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const { userId, title, body, link } = await request.json();

        if (!userId || !title || !body) {
            return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
        }

        // 1. Buscamos el token del usuario en la base de datos (Backend)
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
        }

        const userData = userDoc.data();
        const token = userData?.fcmToken;

        // Si el usuario no tiene notificaciones activadas, no hacemos nada
        if (!token) {
            console.log(`🔕 El usuario ${userId} no tiene token FCM.`);
            return NextResponse.json({ message: "Usuario sin notificaciones activas" }, { status: 200 });
        }

        // 2. Enviamos el mensaje a través de la nube de Google
        await adminMessaging.send({
            token: token,
            notification: {
                title: title,
                body: body,
            },
            webpush: {
                fcmOptions: {
                    link: link || '/orders' // A dónde va si le hace clic
                },
                notification: {
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-72x72.png'
                }
            }
        });

        console.log(`🔔 Notificación enviada a ${userId}`);
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("❌ Error enviando Push:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}