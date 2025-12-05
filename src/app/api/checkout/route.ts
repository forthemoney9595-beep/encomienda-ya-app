import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const { userId, title, body, link } = await request.json();

        if (!userId || !title || !body) {
            return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
        }

        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
        }

        const userData = userDoc.data();
        const token = userData?.fcmToken;

        if (!token) {
            return NextResponse.json({ message: "Usuario sin token" }, { status: 200 });
        }

        // 🔥 CORRECCIÓN: HARDCODEAMOS EL DOMINIO DE VERCEL
        // Reemplaza esto con TU dominio real de Vercel si cambia en el futuro
        const baseUrl = 'https://encomienda-ya-app.vercel.app';
        
        // Construimos el link absoluto
        const finalLink = link ? `${baseUrl}${link}` : `${baseUrl}/orders`;

        await adminMessaging.send({
            token: token,
            notification: {
                title: title,
                body: body,
            },
            // Datos ocultos que usará el Service Worker
            data: {
                click_action: finalLink,
                url: finalLink
            },
            webpush: {
                fcmOptions: {
                    link: finalLink
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
        console.error("❌ Error Push:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}