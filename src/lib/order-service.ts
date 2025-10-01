

'use server';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

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
    storeCoords?: { lat: number; lon: number };
    customerCoords?: { lat: number; lon: number };
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
    
    // --- Prototype Logic ---
    if (storeId.startsWith('proto-')) {
        const deliveryFee = 5.00;
        const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0) + deliveryFee;

        // Static coordinates for prototype to ensure map functionality.
        const storeCoords = { lat: 40.7128, lon: -74.0060 }; // Example: NYC
        const customerCoords = { lat: 34.0522, lon: -118.2437 }; // Example: LA

        const newPrototypeOrder: Order = {
            id: `proto-order-${Date.now()}`,
            userId: userId,
            customerName: customerName,
            items: items,
            total: total,
            deliveryFee: deliveryFee,
            status: 'En preparación' as const,
            storeId: storeId,
            storeName: storeName,
            storeAddress: storeAddress,
            shippingAddress: {
                name: shippingInfo.name,
                address: shippingInfo.address
            },
            createdAt: new Date(),
            storeCoords: storeCoords,
            customerCoords: customerCoords,
        };
        return newPrototypeOrder;
    }

    // --- Real Firestore Order Logic ---
    
    const storeCoords = { lat: 40.7128, lon: -74.0060 };
    const customerCoords = { lat: 34.0522, lon: -118.2437 };

    const distanceKm = 1 + Math.random() * 10;
    const deliveryFee = 2 + (distanceKm * 1.5);

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + deliveryFee;

    const orderRef = await addDoc(collection(db, 'orders'), {
        userId,
        customerName, 
        items: items.map(item => ({...item})), // Store a clean copy of item data
        subtotal,
        deliveryFee,
        total,
        status: 'En preparación',
        createdAt: serverTimestamp(),
        storeId: storeId,
        storeName: storeName,
        storeAddress: storeAddress,
        shippingAddress: shippingInfo,
        deliveryPersonId: null, // Initially unassigned
        deliveryPersonName: null,
        storeCoords,
        customerCoords,
    });
    
    const createdOrderDoc = await getDoc(orderRef);
    const createdOrderData = createdOrderDoc.data();

    const createdOrder: Order = {
      id: orderRef.id,
      userId,
      customerName,
      items,
      total,
      deliveryFee,
      status: 'En preparación',
      createdAt: (createdOrderData!.createdAt as Timestamp)?.toDate() || new Date(),
      storeId,
      storeName: storeName,
      storeAddress: storeAddress,
      shippingAddress: shippingInfo,
      storeCoords,
      customerCoords,
    };

    return createdOrder;
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

export async function getAvailableOrdersForDelivery(isPrototype: boolean): Promise<Order[]> {
  if (isPrototype) {
    // This logic is now client-side in usePrototypeData, but we can keep a server-side
    // representation for other potential uses, though it won't be from session storage.
    // For this app, client-side is sufficient.
    return [];
  }
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
