'use server';

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
 * Creates an order. In prototype mode, it generates the data object with coordinates.
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
        storeId,
        storeName,
        storeAddress,
        shippingAddress: shippingInfo,
        storeCoords,
        customerCoords,
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
    };
    
    // In pure prototype mode, we just return the object for the context to handle.
    return {
        ...newOrderData,
        id: `proto-order-${Date.now()}`,
        createdAt: new Date(),
    };
}


export async function getOrdersByUser(userId: string): Promise<Order[]> {
    console.warn('getOrdersByUser is a placeholder in prototype mode.');
    return [];
}

/**
 * Updates the status of an order.
 * @param orderId The ID of the order to update.
 * @param status The new status for the order.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  console.warn('updateOrderStatus is a placeholder in prototype mode.');
  return;
}

/**
 * Assigns an order to a delivery person and updates its status.
 * @param orderId The ID of the order to assign.
 * @param driverId The ID of the delivery person.
 * @param driverName The name of the delivery person.
 */
export async function assignOrderToDeliveryPerson(orderId: string, driverId: string, driverName: string): Promise<void> {
    console.warn('assignOrderToDeliveryPerson is a placeholder in prototype mode.');
    return;
}

export async function getAvailableOrdersForDelivery(): Promise<Order[]> {
  console.warn('getAvailableOrdersForDelivery is a placeholder in prototype mode.');
  return [];
}


export async function getOrderById(orderId: string): Promise<Order | null> {
    console.warn('getOrderById is a placeholder in prototype mode.');
    return null;
}
