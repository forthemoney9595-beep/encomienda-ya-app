
'use server';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, Timestamp, updateDoc } from 'firebase/firestore';
import { usePrototypeData } from '@/context/prototype-data-context';

// A CartItem is a Product with a quantity.
export interface CartItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    imageUrl?: string;
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
    storeCoords?: { latitude: number, longitude: number };
    customerCoords?: { latitude: number, longitude: number };
}

interface CreateOrderInput {
    userId: string;
    customerName: string;
    items: CartItem[];
    shippingInfo: { name: string, address: string };
    storeId: string;
    storeName: string;
    storeAddress: string;
}

/**
 * Creates an order. If it's a prototype order, it generates the data object with coordinates.
 * If it's a real order, it saves it to Firestore.
 * @param input The data for the new order.
 * @returns The created order object.
 */
export async function createOrder(
   input: CreateOrderInput
): Promise<Order> {
    const { userId, customerName, items, shippingInfo, storeId, storeName, storeAddress } = input;

    if (items.length === 0) {
        throw new Error("No se puede crear un pedido sin artículos.");
    }
    
    const isPrototype = storeId.startsWith('proto-');
    
    // --- Geocoding and Fee Calculation Logic ---
    // In a real app, this would involve a geocoding API. Here we use static/random values.
    const storeCoords = isPrototype ? { latitude: 40.7128, longitude: -74.0060 } : { latitude: 40.7128, longitude: -74.0060 }; // Example: NYC
    const customerCoords = isPrototype ? { latitude: 34.0522, longitude: -118.2437 } : { latitude: 34.0522, longitude: -118.2437 }; // Example: LA
    const deliveryFee = 5.00 + Math.random() * 5; // Example fee
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0) + deliveryFee;

    const newOrderData = {
        userId,
        customerName,
        items: items.map(item => ({ ...item })), // Store a clean copy
        total,
        deliveryFee,
        status: 'Pedido Realizado' as const,
        storeId,
        storeName,
        storeAddress,
        shippingAddress: shippingInfo,
        storeCoords,
        customerCoords,
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
    };
    
    // --- Prototype Order Handling (Client-side via context) ---
    if (isPrototype) {
        return {
            ...newOrderData,
            id: `proto-order-${Date.now()}`,
            createdAt: new Date(),
        };
    }

    // --- Real Firestore Order Logic ---
    const orderRef = await addDoc(collection(db, 'orders'), {
        ...newOrderData,
        createdAt: serverTimestamp(),
    });
    
    const createdOrderDoc = await getDoc(orderRef);
    const createdOrderData = createdOrderDoc.data();

    return {
      id: orderRef.id,
      ...newOrderData,
      createdAt: (createdOrderData!.createdAt as Timestamp)?.toDate() || new Date(),
    };
}


export async function getOrdersByUser(userId: string): Promise<Order[]> {
    if (userId.startsWith('proto-')) {
        console.warn('getOrdersByUser (server) called for prototype user. Data should be fetched from context on client.');
        return [];
    }
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
 * Prototype orders are handled entirely on the client via PrototypeDataContext.
 * @param orderId The ID of the order to update.
 * @param status The new status for the order.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  if (orderId.startsWith('proto-')) {
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

// This function is now only for real data, prototype data is handled by the context
export async function getAvailableOrdersForDelivery(): Promise<Order[]> {
  const ordersRef = collection(db, 'orders');
  const q = query(
    ordersRef,
    where('status', '==', 'En preparación'),
    where('deliveryPersonId', '==', null),
    orderBy('createdAt', 'asc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: (doc.data().createdAt as Timestamp).toDate(),
  })) as Order[];
}


export async function getOrderById(orderId: string): Promise<Order | null> {
    if (orderId.startsWith('proto-')) {
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
