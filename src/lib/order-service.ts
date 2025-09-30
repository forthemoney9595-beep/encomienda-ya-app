'use server';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { type Product, prototypeUsers, prototypeStore, prototypeProducts, type PrototypeOrder, savePrototypeOrder, getPrototypeOrders } from './placeholder-data';
import { getStoreById } from './data-service';
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
    // Let's add customer info for the store view
    customerName?: string;
    storeAddress?: string; // Add store address for delivery personnel
    deliveryPersonId?: string;
    deliveryPersonName?: string;
}

interface CreateOrderInput {
    userId: string;
    items: CartItem[];
    shippingInfo: { name: string, address: string };
    storeId: string;
    isPrototype?: boolean;
}

interface CreateOrderOutput {
    orderId: string;
    deliveryFee: number;
    total: number;
}

// Haversine formula to calculate distance between two lat/lon points
function getDistanceFromLatLonInKm(lat1:number, lon1:number, lat2:number, lon2:number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2-lat1);
    const dLon = deg2rad(lon2-lon1); 
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2)
        ; 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI/180)
}

export async function createOrder(
   input: CreateOrderInput
): Promise<CreateOrderOutput> {
    const { userId, items, shippingInfo, storeId, isPrototype } = input;

    if (items.length === 0) {
        throw new Error("No se puede crear un pedido sin artículos.");
    }
    
    // Simulate order creation for prototype
    if (isPrototype) {
        console.log("PROTOTYPE: Simulating order creation.");
        
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const deliveryFee = 5.00; // Mock fee
        const total = subtotal + deliveryFee;
        const mockOrderId = `proto-order-${Date.now()}`;
        const buyer = prototypeUsers['comprador@test.com'];

        const newOrder: PrototypeOrder = {
            id: mockOrderId,
            userId: buyer.uid,
            customerName: buyer.name,
            items: items,
            total: total,
            deliveryFee: deliveryFee,
            status: 'Pedido Realizado',
            createdAt: new Date().toISOString(),
            storeId: prototypeStore.id,
            storeName: prototypeStore.name,
            storeAddress: prototypeStore.address,
            shippingAddress: shippingInfo,
        };

        savePrototypeOrder(newOrder);

        return {
            orderId: mockOrderId,
            deliveryFee,
            total,
        }
    }

    let store = await getStoreById(storeId);
    let customerName = shippingInfo.name;
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
        customerName = userDoc.data().name;
    }
    
    if (!store) {
        throw new Error(`No se pudo encontrar la tienda con ID ${storeId}`);
    }

    // Geocode addresses
    const [storeCoords, customerCoords] = await Promise.all([
        geocodeAddress({ address: store.address }),
        geocodeAddress({ address: shippingInfo.address })
    ]);

    // Calculate delivery fee: $2 base + $1.5 per km
    // If geocoding fails, use a fallback flat fee.
    const distanceKm = storeCoords.lat && customerCoords.lat ? getDistanceFromLatLonInKm(storeCoords.lat, storeCoords.lon, customerCoords.lat, customerCoords.lon) : -1;
    const deliveryFee = distanceKm >= 0 ? 2 + (distanceKm * 1.5) : 5.00;

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + deliveryFee;

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
            imageUrl: item.imageUrl || null,
        })), 
        subtotal,
        deliveryFee,
        total,
        status: 'Pedido Realizado',
        createdAt: serverTimestamp(),
        storeId: store.id,
        storeName: store.name,
        storeAddress: store.address,
        shippingAddress: shippingInfo,
        deliveryPersonId: null, // Initially unassigned
    });
    
    return {
        orderId: orderRef.id,
        deliveryFee,
        total
    };
}


export async function getOrdersByUser(userId: string): Promise<Order[]> {
    if (userId.startsWith('proto-')) {
        const protoOrders = getPrototypeOrders();
        // For buyer, filter orders by their userId
        return protoOrders
            .filter(o => o.userId === userId)
            .map(o => ({...o, createdAt: new Date(o.createdAt)}))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
    if (orderId.startsWith('proto-order-')) {
        const protoOrders = getPrototypeOrders();
        const order = protoOrders.find(o => o.id === orderId);
        if (order) {
            return { ...order, createdAt: new Date(order.createdAt) };
        }
        return null;
    }


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
  if (orderId.startsWith('proto-order-')) {
    console.log(`PROTOTYPE: Simulating update order ${orderId} to ${status}`);
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
