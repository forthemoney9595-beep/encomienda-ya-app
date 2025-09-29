import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
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
    
    // In a more complex app, this would need validation or handling for multi-store orders.
    // Here, we assume all items are from the same store based on the first item.
    const storeDetails = await getStoreDetailsFromProductId(items[0].id);

    const orderRef = await addDoc(collection(db, 'orders'), {
        userId,
        // Convert CartItems to plain objects for Firestore.
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
    });
    return orderRef.id;
}


// Helper to find which store a product belongs to.
// This is a simplification. In a real-world app, the productId might have a format
// that includes the storeId, or the cartItem object itself might already hold the storeId.
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
            createdAt: data.createdAt?.toDate() || new Date(), // Handle server timestamp
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
            createdAt: data.createdAt?.toDate() || new Date(), // Handle server timestamp
        } as Order;
    } else {
        console.log(`No order found with id: ${orderId}`);
        return null;
    }
}
