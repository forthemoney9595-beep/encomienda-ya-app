
'use server';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { type Product } from './placeholder-data';
import { geocodeAddress } from '@/ai/flows/geocode-address';

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
    deliveryFee: number;
    status: OrderStatus;
    createdAt: Date;
    storeId: string; 
    storeName: string; 
    shippingAddress: {
        name: string;
        address: string;
    };
    customerName?: string;
    storeAddress?: string; 
    deliveryPersonId?: string;
    deliveryPersonName?: string;
    storeCoords?: { lat: number; lon: number };
    customerCoords?: { lat: number; lon: number };
}

interface CreateOrderInput {
    userId: string;
    items: CartItem[];
    shippingInfo: { name: string, address: string };
    storeId: string;
}

interface CreateOrderOutput {
    orderId: string;
    deliveryFee: number;
    total: number;
}


export async function createOrder(
   input: CreateOrderInput
): Promise<CreateOrderOutput> {
    const { userId, items, shippingInfo, storeId } = input;

    if (items.length === 0) {
        throw new Error("No se puede crear un pedido sin artículos.");
    }
    
    // Real order logic
    const storeDoc = await getDoc(doc(db, 'stores', storeId));
    if (!storeDoc.exists()) {
        throw new Error(`No se pudo encontrar la tienda con ID ${storeId}`);
    }
    const store = storeDoc.data();

    let customerName = shippingInfo.name;
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
        customerName = userDoc.data().name;
    }

    const [storeCoords, customerCoords] = await Promise.all([
        geocodeAddress({ address: store.address }),
        geocodeAddress({ address: shippingInfo.address })
    ]);

    const distanceKm = 1 + Math.random() * 10;
    const deliveryFee = 2 + (distanceKm * 1.5);

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + deliveryFee;

    const orderRef = await addDoc(collection(db, 'orders'), {
        userId,
        customerName: customerName, 
        items: items.map(item => ({...item})), // Store a clean copy of item data
        subtotal,
        deliveryFee,
        total,
        status: 'En preparación',
        createdAt: serverTimestamp(),
        storeId: storeDoc.id,
        storeName: store.name,
        storeAddress: store.address,
        shippingAddress: shippingInfo,
        deliveryPersonId: null, // Initially unassigned
        deliveryPersonName: null,
        storeCoords,
        customerCoords,
    });
    
    return {
        orderId: orderRef.id,
        deliveryFee,
        total
    };
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

/**
 * Updates the status of an order.
 * This function only handles real database orders now.
 * Prototype orders are handled entirely on the client via PrototypeDataContext.
 * @param orderId The ID of the order to update.
 * @param status The new status for the order.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  if (orderId.startsWith('proto-')) {
    // This case is handled by client-side context (usePrototypeData hook).
    // This server action is only for real database interactions.
    console.warn('updateOrderStatus server action called for a prototype order. This should be handled on the client.');
    return;
  }
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
 * Prototype logic is now handled on the client-side.
 * @param orderId The ID of the order to assign.
 * @param driverId The ID of the delivery person.
 * @param driverName The name of the delivery person.
 */
export async function assignOrderToDeliveryPerson(orderId: string, driverId: string, driverName: string): Promise<void> {
    if (orderId.startsWith('proto-')) {
        // This case is handled by client-side context (usePrototypeData hook).
        // This server action is only for real database interactions.
        console.warn('assignOrderToDeliveryPerson server action called for a prototype order. This should be handled on the client.');
        return;
    }
    
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

export async function getOrderById(orderId: string): Promise<Order | null> {
    // Prototype orders are now handled by the PrototypeDataContext on the client.
    // This function is only for REAL database orders.
    if (orderId.startsWith('proto-order-')) {
        console.warn('getOrderById server action called for a prototype order. This should be handled on the client.');
        return null;
    }

    try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
            const data = orderDoc.data();
            return {
                id: orderDoc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Order;
        }
        return null;
    } catch (error) {
        console.error("Error fetching order by ID:", error);
        return null;
    }
}
