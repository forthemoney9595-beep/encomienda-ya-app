import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const { userId, title, body, link } = await request.json();

        if (!userId || !title || !body) {
            return NextResponse.json({ error: "Faltan datos requeridos (userId, title, body)" }, { status: 400 });
        }

        // 1. Buscar el usuario en la base de datos
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            console.warn(`⚠️ Intento de notificar a usuario inexistente: ${userId}`);
            return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
        }

        const userData = userDoc.data();
        
        // 2. Obtener Tokens (Soportamos string único o array de tokens para múltiples dispositivos)
        let tokens: string[] = [];

        if (userData?.fcmToken && typeof userData.fcmToken === 'string') {
            tokens.push(userData.fcmToken);
        }
        
        if (userData?.fcmTokens && Array.isArray(userData.fcmTokens)) {
            tokens = [...tokens, ...userData.fcmTokens];
        }

        // Eliminar duplicados
        tokens = [...new Set(tokens)];

        if (tokens.length === 0) {
            console.log(`🔕 El usuario ${userId} no tiene dispositivos registrados para notificaciones.`);
            return NextResponse.json({ message: "Usuario sin tokens activos", success: false }, { status: 200 });
        }

        // 3. Preparar el mensaje (Payload)
        // Configuramos para Web y Móvil simultáneamente
        const messagePayload = {
            notification: {
                title: title,
                body: body,
            },
            // Configuración específica para Web
            webpush: {
                headers: {
                    Urgency: "high"
                },
                notification: {
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-72x72.png',
                    click_action: link || '/orders', // Para navegadores antiguos
                },
                fcmOptions: {
                    link: link || '/orders' // Para navegadores modernos
                }
            },
            // Datos invisibles (Útil para manejar lógica en el cliente al recibir)
            data: {
                url: link || '/orders',
                click_action: link || '/orders' // Respaldo para Android
            }
        };

        // 4. Enviar a todos los dispositivos (Multicast)
        // Usamos sendEachForMulticast para enviar a varios tokens a la vez
        const response = await adminMessaging.sendEachForMulticast({
            tokens: tokens,
            ...messagePayload
        });

        // 5. Análisis de resultados y Limpieza de Tokens inválidos
        if (response.failureCount > 0) {
            const failedTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const badToken = tokens[idx];
                    // Si el error es que el token no es válido, lo marcamos para borrar
                    if (resp.error?.code === 'messaging/registration-token-not-registered' || 
                        resp.error?.code === 'messaging/invalid-argument') {
                        failedTokens.push(badToken);
                    }
                    console.error(`❌ Fallo al enviar a un token:`, resp.error);
                }
            });

            // Opcional: Aquí podrías agregar lógica para borrar 'failedTokens' de la DB
            if (failedTokens.length > 0) {
                console.log(`🧹 Se detectaron ${failedTokens.length} tokens inválidos para limpiar.`);
                // await adminDb.collection('users').doc(userId).update({
                //    fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
                // });
            }
        }

        console.log(`🔔 Notificación enviada a ${userId}: ${response.successCount} éxitos, ${response.failureCount} fallos.`);
        
        return NextResponse.json({ 
            success: true, 
            sentCount: response.successCount,
            failureCount: response.failureCount 
        });

    } catch (error: any) {
        console.error("❌ Error CRÍTICO enviando Push:", error);
        return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
    }
}