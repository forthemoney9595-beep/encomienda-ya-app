import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, Timestamp } from 'firebase/firestore';
import type { Product } from './placeholder-data';

// A CartItem is a Product with a quantity.
export interface CartItem extends Product {
    quantity: number;
}

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
    // Let's add customer info for the store view
    customerName?: string;
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
    
    const storeDetails = await getStoreDetailsFromProductId(items[0].id);

    const orderRef = await addDoc(collection(db, 'orders'), {
        userId,
        items: items.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            category: item.category,
            quantity: item.quantity,
        })), 
        total,
        status: 'Pedido Realizado',
        createdAt: serverTimestamp(),
        storeId: storeDetails.id,
        storeName: storeDetails.name,
        shippingAddress: shippingInfo,
        customerName: shippingInfo.name, // Store the customer name directly
    });
    return orderRef.id;
}

async function getStoreDetailsFromProductId(productId: string): Promise<{id: string, name: string}> {
    const storesRef = collection(db, "stores");
    const q = query(storesRef);
    const storesSnapshot = await getDocs(q);

    for (const storeDoc of storesSnapshot.docs) {
        const productsRef = collection(db, "stores", storeDoc.id, "products");
        const productDoc = await getDoc(doc(productsRef, productId));
        if (productDoc.exists()) {
            return { id: storeDoc.id, name: storeDoc.data().name || "Tienda sin nombre" };
        }
    }
    
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
            createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
        } as Order;
    });

    return orders;
}

export async function getOrdersByStore(storeId: string): Promise<Order[]> {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const orders: Order[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
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
            createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
        } as Order;
    } else {
        console.log(`No order found with id: ${orderId}`);
        return null;
    }
}
