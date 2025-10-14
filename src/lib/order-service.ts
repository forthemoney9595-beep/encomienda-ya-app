
'use server';

import { collection, addDoc, getDoc, doc, updateDoc, Firestore, Timestamp } from 'firebase/firestore';

// A CartItem is a Product with a quantity.
export interface CartItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    imageUrl?: string;
    quantity: number;
    userRating?: number; // New field to track if user has rated this item in this order
}

export type OrderStatus = 'Pendiente de Confirmación' | 'Pendiente de Pago' | 'En preparación' | 'En reparto' | 'Entregado' | 'Cancelado' | 'Rechazado';

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
    deliveryRating?: number;
    deliveryReview?: string;
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
 * Creates an order in Firestore.
 * @param db The Firestore instance.
 * @param input The data for the new order.
 * @returns The created order object with its new ID.
 */
export async function createOrder(
   db: Firestore,
   input: CreateOrderInput
): Promise<Order> {
    const { userId, customerName, items, shippingInfo, storeId, storeName, storeAddress } = input;

    if (items.length === 0) {
        throw new Error("No se puede crear un pedido sin artículos.");
    }
    
    // --- Geocoding and Fee Calculation Logic ---
    // In a real app, this would involve a geocoding API. Here we use static/random values.
    const storeCoords = { latitude: 40.7128, longitude: -74.0060 }; // Example: NYC
    const customerCoords = { latitude: 34.0522, longitude: -118.2437 }; // Example: LA
    const deliveryFee = 5.00 + Math.random() * 5; // Example fee
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0) + deliveryFee;

    const newOrderData = {
        userId,
        customerName,
        items: items.map(item => ({ ...item })), // Store a clean copy
        total,
        deliveryFee,
        status: 'Pendiente de Confirmación' as const,
        createdAt: Timestamp.now(),
        storeId,
        storeName,
        storeAddress,
        shippingAddress: shippingInfo,
        storeCoords,
        customerCoords,
        deliveryPersonId: '',
        deliveryPersonName: '',
    };
    
    const ordersCollection = collection(db, 'orders');
    const newOrderRef = await addDoc(ordersCollection, newOrderData);

    return {
        ...newOrderData,
        id: newOrderRef.id,
        createdAt: newOrderData.createdAt.toDate(),
    };
}


/**
 * Fetches a single order by its ID from Firestore.
 * @param db The Firestore instance.
 * @param orderId The ID of the order.
 * @returns The order object or null if not found.
 */
export async function getOrderById(db: Firestore, orderId: string): Promise<Order | null> {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (orderSnap.exists()) {
        const data = orderSnap.data();
        // Convert Firestore Timestamp to JS Date
        return { 
            ...data, 
            id: orderSnap.id,
            createdAt: (data.createdAt as Timestamp).toDate(),
        } as Order;
    }
    return null;
}


/**
 * Updates the status of an order.
 * @param db The Firestore instance.
 * @param orderId The ID of the order to update.
 * @param status The new status for the order.
 */
export async function updateOrderStatus(db: Firestore, orderId: string, status: OrderStatus): Promise<void> {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, { status });
}

/**
 * Assigns an order to a delivery person and updates its status.
 * @param db The Firestore instance.
 * @param orderId The ID of the order to assign.
 * @param driverId The ID of the delivery person.
 * @param driverName The name of the delivery person.
 */
export async function assignOrderToDeliveryPerson(db: Firestore, orderId: string, driverId: string, driverName: string): Promise<void> {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, {
        deliveryPersonId: driverId,
        deliveryPersonName: driverName,
        status: 'En reparto'
    });
}

    