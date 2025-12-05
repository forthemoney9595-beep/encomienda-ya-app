import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Configuración de costos
const PLATFORM_FEE_PERCENTAGE = 0.05; 
const DEFAULT_DELIVERY_FEE = 2000; 

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, items, storeId, shippingInfo, customerName, customerPhoneNumber } = body;

        if (!userId || !items || !storeId) {
            return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
        }

        // 1. SEGURIDAD: Recalcular precios en el servidor
        let calculatedSubtotal = 0;
        const verifiedItems = [];

        for (const item of items) {
            // Buscamos el producto en la DB para obtener su precio real
            const productDoc = await adminDb
                .collection('stores')
                .doc(storeId)
                .collection('products')
                .doc(item.id)
                .get();

            if (!productDoc.exists) {
                console.warn(`Producto ${item.id} no encontrado en DB, usando precio enviado: ${item.price}`);
                calculatedSubtotal += (Number(item.price) * Number(item.quantity));
                verifiedItems.push(item);
            } else {
                const productData = productDoc.data();
                const realPrice = Number(productData?.price || 0);
                
                calculatedSubtotal += (realPrice * Number(item.quantity));
                
                verifiedItems.push({
                    ...item,
                    price: realPrice,
                    name: productData?.name || item.name
                });
            }
        }

        // 2. Calcular Totales Seguros
        const serviceFee = Math.round(calculatedSubtotal * PLATFORM_FEE_PERCENTAGE);
        const deliveryFee = DEFAULT_DELIVERY_FEE;
        const total = calculatedSubtotal + serviceFee + deliveryFee;

        // 3. Crear la Orden en Firestore (Backend)
        const newOrderRef = adminDb.collection('orders').doc();
        
        const orderData = {
            id: newOrderRef.id,
            userId,
            customerName,
            customerPhoneNumber,
            storeId,
            storeName: body.storeName || 'Tienda', 
            storeAddress: body.storeAddress || '',
            
            status: 'Pendiente de Confirmación',
            
            items: verifiedItems,
            
            subtotal: calculatedSubtotal,
            deliveryFee,
            serviceFee,
            total,
            
            paymentMethod: 'CARD',
            
            shippingInfo,
            shippingAddress: shippingInfo,
            
            createdAt: FieldValue.serverTimestamp(),
            
            // ✅ CORRECCIÓN: Tipado explícito para evitar error 'implicitly has any type'
            deliveryPersonId: null as string | null,
            readyForPickup: false,
            
            storeCoords: { latitude: -28.46957, longitude: -65.77954 },
            customerCoords: { latitude: -28.46957, longitude: -65.77954 } 
        };

        await newOrderRef.set(orderData);

        // 4. Notificar a la Tienda (Backend to Backend)
        const storeDoc = await adminDb.collection('stores').doc(storeId).get();
        const storeOwnerId = storeDoc.data()?.ownerId;

        if (storeOwnerId) {
            const ownerUserDoc = await adminDb.collection('users').doc(storeOwnerId).get();
            const ownerToken = ownerUserDoc.data()?.fcmToken;

            if (ownerToken) {
                await adminMessaging.send({
                    token: ownerToken,
                    notification: {
                        title: "🔔 Nuevo Pedido Real",
                        body: `¡${customerName} ha hecho un pedido de $${total.toLocaleString()}! Confirma stock.`,
                    },
                    data: {
                        // Importante: Usamos URL absoluta si conocemos el dominio, o relativa si el SW la maneja
                        url: `/orders/${newOrderRef.id}`
                    },
                    webpush: {
                        fcmOptions: {
                            // En producción, asegúrate de que esta URL sea absoluta
                            link: `/orders/${newOrderRef.id}`
                        }
                    }
                });
                console.log("Notificación enviada al dueño:", storeOwnerId);
            }
        }

        return NextResponse.json({ id: newOrderRef.id, success: true });

    } catch (error: any) {
        console.error("Error creando orden segura:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}