import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const PLATFORM_FEE_PERCENTAGE = 0.05; 
const DEFAULT_DELIVERY_FEE = 2000; 

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, items, storeId, shippingInfo, customerName, customerPhoneNumber } = body;

        console.log(`📦 Creando orden para tienda: ${storeId}`);

        if (!userId || !items || !storeId) {
            return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
        }

        let calculatedSubtotal = 0;
        const verifiedItems = [];

        for (const item of items) {
            // 1. INTENTO A: Buscar en colección 'products'
            let productDoc = await adminDb
                .collection('stores')
                .doc(storeId)
                .collection('products')
                .doc(item.id)
                .get();

            // 2. INTENTO B: Si no existe, buscar en 'items' (Compatibilidad)
            if (!productDoc.exists) {
                productDoc = await adminDb
                    .collection('stores')
                    .doc(storeId)
                    .collection('items')
                    .doc(item.id)
                    .get();
            }

            if (!productDoc.exists) {
                console.error(`❌ ALERTA DE SEGURIDAD: Producto ${item.id} no encontrado en DB.`);
                // Opción segura: Rechazar pedido si no se valida el precio.
                // Opción flexible (dev): Usar precio del front pero loguear error.
                // Vamos a usar una lógica defensiva:
                const fallbackPrice = Number(item.price) || 0;
                calculatedSubtotal += (fallbackPrice * Number(item.quantity));
                verifiedItems.push(item);
            } else {
                const productData = productDoc.data();
                
                // Aseguramos que el precio sea un número limpio
                const realPrice = Number(productData?.price);
                
                if (isNaN(realPrice)) {
                    console.error(`❌ ERROR: El precio en DB no es un número válido para ${productData?.name}`);
                    throw new Error("Error en datos de producto");
                }
                
                calculatedSubtotal += (realPrice * Number(item.quantity));
                
                verifiedItems.push({
                    ...item,
                    price: realPrice, 
                    name: productData?.name || item.name 
                });
            }
        }

        // Validación final anti-NaN
        if (isNaN(calculatedSubtotal)) {
            throw new Error("Error crítico: El subtotal calculado es NaN");
        }

        const serviceFee = Math.round(calculatedSubtotal * PLATFORM_FEE_PERCENTAGE);
        const deliveryFee = DEFAULT_DELIVERY_FEE;
        const total = calculatedSubtotal + serviceFee + deliveryFee;

        console.log(`💰 Totales calculados: Subtotal ${calculatedSubtotal}, Total ${total}`);

        // Crear la Orden
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
            deliveryPersonId: null as string | null,
            readyForPickup: false,
            storeCoords: { latitude: -28.46957, longitude: -65.77954 },
            customerCoords: { latitude: -28.46957, longitude: -65.77954 } 
        };

        await newOrderRef.set(orderData);

        // Notificar Dueño
        const storeDoc = await adminDb.collection('stores').doc(storeId).get();
        const storeOwnerId = storeDoc.data()?.ownerId;

        if (storeOwnerId) {
            const ownerUserDoc = await adminDb.collection('users').doc(storeOwnerId).get();
            const ownerToken = ownerUserDoc.data()?.fcmToken;

            if (ownerToken) {
                // Hardcodeamos la URL base para asegurar que funcione en producción
                const baseUrl = 'https://encomienda-ya-app.vercel.app';
                const link = `${baseUrl}/orders/${newOrderRef.id}`;

                await adminMessaging.send({
                    token: ownerToken,
                    notification: {
                        title: "🔔 Nuevo Pedido",
                        body: `¡${customerName} ha hecho un pedido de $${total.toLocaleString()}! Confirma stock.`,
                    },
                    data: { url: link },
                    webpush: { fcmOptions: { link: link } }
                });
            }
        }

        return NextResponse.json({ id: newOrderRef.id, success: true });

    } catch (error: any) {
        console.error("Error creando orden:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}