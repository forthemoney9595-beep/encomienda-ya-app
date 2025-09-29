import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import type { Product } from './placeholder-data';
import { getStoreById } from './data-service';

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
    storeAddress?: string; // Add store address for delivery personnel
    deliveryPersonId?: string;
    deliveryPersonName?: string;
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
    
    // Assume all items are from the same store for this transaction
    const firstProductId = items[0].id;
    const storeInfo = await getStoreDetailsFromProductId(firstProductId);
    if (!storeInfo) {
        throw new Error(`Could not find a store for product id ${firstProductId}`);
    }

    const userDoc = await getDoc(doc(db, 'users', userId));
    const customerName = userDoc.exists() ? userDoc.data().name : shippingInfo.name;

    const orderRef = await addDoc(collection(db, 'orders'), {
        userId,
        customerName: customerName, 
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
        storeId: storeInfo.id,
        storeName: storeInfo.name,
        storeAddress: storeInfo.address,
        shippingAddress: shippingInfo,
    });
    return orderRef.id;
}

async function getStoreDetailsFromProductId(productId: string): Promise<{id: string, name: string, address: string} | null> {
    const storesRef = collection(db, "stores");
    const q = query(storesRef, where('status', '==', 'Aprobado')); // Only search in approved stores
    const storesSnapshot = await getDocs(q);

    for (const storeDoc of storesSnapshot.docs) {
        const productDocRef = doc(db, "stores", storeDoc.id, "products", productId);
        const productDocSnapshot = await getDoc(productDocRef);
        if (productDocSnapshot.exists()) {
            const storeData = storeDoc.data();
            return { 
                id: storeDoc.id, 
                name: storeData.name || "Tienda sin nombre", 
                address: storeData.address || "Dirección desconocida" 
            };
        }
    }
    
    console.warn(`Could not find store for product ${productId}.`);
    return null;
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

export async function getAvailableOrdersForDelivery(): Promise<Order[]> {
    const ordersRef = collection(db, 'orders');
    // Orders ready for pickup and not yet assigned
    const q = query(
        ordersRef, 
        where('status', '==', 'En preparación'), 
        where('deliveryPersonId', '==', null),
        orderBy('createdAt', 'asc')
    );

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

export async function getOrdersByDeliveryPerson(driverId: string): Promise<Order[]> {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, 
        where('deliveryPersonId', '==', driverId),
        where('status', '==', 'En reparto'),
        orderBy('createdAt', 'asc')
    );

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


/**
 * Updates the status of an order.
 * @param orderId The ID of the order to update.
 * @param status The new status for the order.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, { status });
  } catch (error) {
    console.error(`Error updating order status for ${orderId}:`, error);
    throw error;
  }
}

/**
 * Assigns an order to a delivery person and updates its status.
 * @param orderId The ID of the order to assign.
 * @param driverId The ID of the delivery person.
 * @param driverName The name of the delivery person.
 */
export async function assignOrderToDeliveryPerson(orderId: string, driverId: string, driverName: string): Promise<void> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists() || orderSnap.data().deliveryPersonId) {
        throw new Error("El pedido ya no está disponible o ya ha sido asignado.");
    }

    await updateDoc(orderRef, {
      status: 'En reparto',
      deliveryPersonId: driverId,
      deliveryPersonName: driverName,
    });
  } catch (error) {
    console.error(`Error assigning order ${orderId} to driver ${driverId}:`, error);
    throw error;
  }
}
