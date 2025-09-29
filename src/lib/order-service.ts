import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import type { CartItem } from '@/context/cart-context';

export type OrderStatus = 'Pedido Realizado' | 'En preparación' | 'En reparto' | 'Entregado' | 'Cancelado';

export interface Order {
    id: string;
    userId: string;
    items: CartItem[];
    total: number;
    status: OrderStatus;
    createdAt: Date;
    storeId: string; 
    storeName: string; 
    shippingAddress: {
        name: string;
        address: string;
    };
}

export async function createOrder(
    userId: string, 
    items: CartItem[], 
    total: number, 
    shippingInfo: { name: string, address: string }
): Promise<string> {
    if (items.length === 0) {
        throw new Error("No se puede crear un pedido sin artículos.");
    }
    
    // Asumimos que todos los artículos son de la misma tienda.
    // En una app más compleja, esto necesitaría validación o manejo de pedidos a múltiples tiendas.
    const storeDetails = await getStoreDetailsFromProductId(items[0].id);

    const orderRef = await addDoc(collection(db, 'orders'), {
        userId,
        items: items.map(item => ({...item})), // Convert cart items to plain objects
        total,
        status: 'Pedido Realizado',
        createdAt: serverTimestamp(),
        storeId: storeDetails.id,
        storeName: storeDetails.name,
        shippingAddress: shippingInfo,
    });
    return orderRef.id;
}


// Helper para encontrar la tienda a la que pertenece un producto
// Esto es una simplificación. En una app real, el `productId` podría tener un formato
// que incluya el `storeId`, o el `cartItem` podría ya tener el `storeId`.
async function getStoreDetailsFromProductId(productId: string): Promise<{id: string, name: string}> {
    const storesRef = collection(db, "stores");
    const q = query(storesRef);
    const storesSnapshot = await getDocs(q);

    for (const storeDoc of storesSnapshot.docs) {
        const productsRef = collection(db, "stores", storeDoc.id, "products");
        const productDoc = await getDoc(doc(productsRef, productId));
        if (productDoc.exists()) {
            return { id: storeDoc.id, name: storeDoc.data().name };
        }
    }
    
    // This is a fallback and shouldn't be reached in normal operation
    console.warn(`Could not find store for product ${productId}. Falling back to a default.`);
    return { id: 'unknown_store', name: 'Tienda Desconocida' };
}


export async function getOrdersByUser(userId: string): Promise<Order[]> {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const orders: Order[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt.toDate(),
        } as Order;
    });

    return orders;
}

export async function getOrderById(orderId: string): Promise<Order | null> {
    const orderRef = doc(db, 'orders', orderId);
    const docSnap = await getDoc(orderRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt.toDate(),
        } as Order;
    } else {
        console.log(`No order found with id: ${orderId}`);
        return null;
    }
}
