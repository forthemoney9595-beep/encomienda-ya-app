import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const PLATFORM_FEE_PERCENTAGE = 0.05; 
const DEFAULT_DELIVERY_FEE = 2000; 

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, items, storeId, shippingInfo, customerName, customerPhoneNumber } = body;

        // Validación correcta para CREAR (No pide orderId)
        if (!userId || !items || !storeId) {
            return NextResponse.json({ error: "Datos incompletos para crear orden" }, { status: 400 });
        }

        // 1. Calcular Precios Reales
        let calculatedSubtotal = 0;
        const verifiedItems = [];

        for (const item of items) {
            let productDoc = await adminDb.collection('stores').doc(storeId).collection('products').doc(item.id).get();
            
            if (!productDoc.exists) {
                 // Fallback a 'items' si usas esa colección
                 productDoc = await adminDb.collection('stores').doc(storeId).collection('items').doc(item.id).get();
            }

            if (!productDoc.exists) {
                console.warn(`Producto ${item.id} no encontrado. Usando precio front.`);
                calculatedSubtotal += (Number(item.price || 0) * Number(item.quantity));
                verifiedItems.push(item);
            } else {
                const data = productDoc.data();
                const realPrice = Number(data?.price || 0);
                calculatedSubtotal += (realPrice * Number(item.quantity));
                verifiedItems.push({ ...item, price: realPrice, name: data?.name || item.name });
            }
        }

        if (isNaN(calculatedSubtotal)) throw new Error("Error: Subtotal NaN");

        const serviceFee = Math.round(calculatedSubtotal * PLATFORM_FEE_PERCENTAGE);
        const deliveryFee = DEFAULT_DELIVERY_FEE;
        const total = calculatedSubtotal + serviceFee + deliveryFee;

        // 2. Crear Documento
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
            
            // ✅ CORRECCIÓN AQUÍ: Tipado explícito
            deliveryPersonId: null as string | null,
            
            readyForPickup: false,
            // Coordenadas dummy (hasta tener geo real)
            storeCoords: { latitude: -28.46957, longitude: -65.77954 },
            customerCoords: { latitude: -28.46957, longitude: -65.77954 }
        };

        await newOrderRef.set(orderData);

        // 3. Notificar Dueño
        try {
            const storeDoc = await adminDb.collection('stores').doc(storeId).get();
            const ownerId = storeDoc.data()?.ownerId;
            if(ownerId) {
                const userDoc = await adminDb.collection('users').doc(ownerId).get();
                const token = userDoc.data()?.fcmToken;
                if(token) {
                    await adminMessaging.send({
                        token,
                        notification: { title: "🔔 Nuevo Pedido", body: `Nuevo pedido de $${total}` },
                        data: { url: `https://encomienda-ya-app.vercel.app/orders/${newOrderRef.id}` }
                    });
                }
            }
        } catch(e) { console.error("Error notificando:", e); }

        return NextResponse.json({ id: newOrderRef.id, success: true });

    } catch (error: any) {
        console.error("Error Create Order:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}