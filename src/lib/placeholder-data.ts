

import type { CartItem, Order, OrderStatus } from "./order-service";

export type Store = {
  id: string;
  name: string;
  category: string;
  address: string;
  imageUrl: string;
  imageHint: string;
  status: 'Aprobado' | 'Pendiente' | 'Rechazado';
  ownerId: string;
  productCategories: string[];
}

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
}

export type DeliveryPersonnel = {
  id: string;
  name: string;
  vehicle: string;
  zone: string;
  status: 'Activo' | 'Pendiente' | 'Inactivo' | 'Rechazado';
  email: string;
};

export interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: 'buyer' | 'store' | 'delivery' | 'admin';
    storeId?: string;
    [key: string]: any;
}

export const prototypeUsers: Record<string, UserProfile> = {
    'admin@test.com': { uid: 'proto-admin', name: 'Admin Proto', email: 'admin@test.com', role: 'admin' },
    'tienda@test.com': { uid: 'proto-store-owner', name: 'Dueño Tienda Proto', email: 'tienda@test.com', role: 'store', storeId: 'proto-store-id' },
    'repartidor@test.com': { uid: 'proto-delivery', name: 'Repartidor Proto', email: 'repartidor@test.com', role: 'delivery' },
    'comprador@test.com': { uid: 'proto-buyer', name: 'Comprador Proto', email: 'comprador@test.com', role: 'buyer' },
};

export const prototypeStore: Store = {
    id: 'proto-store-id',
    name: "Hamburguesas IA",
    category: "Comida Rápida",
    productCategories: ["Comida", "Bebida"],
    address: "Av. Hamburguesa 456",
    ownerId: 'proto-store-owner',
    status: 'Aprobado',
    imageUrl: "https://picsum.photos/seed/burger/600/400",
    imageHint: "burger joint",
};

// This is now the single source of truth for prototype products.
// Any in-app changes are in-memory and will be lost on reload.
const initialPrototypeProducts: Product[] = [
    { id: 'proto-prod-1', name: "Hamburguesa Clásica IA", description: "La clásica con queso, lechuga y tomate.", price: 9.99, category: 'Comida', imageUrl: "https://picsum.photos/seed/classicburger/200/200" },
    { id: 'proto-prod-2', name: "Hamburguesa Doble IA", description: "Doble carne, doble queso, para los con más hambre.", price: 12.99, category: 'Comida', imageUrl: "https://picsum.photos/seed/doubleburger/200/200" },
    { id: 'proto-prod-3', name: "Refresco", description: "Burbujas refrescantes.", price: 2.50, category: "Bebida", imageUrl: "https://picsum.photos/seed/soda/200/200" },
];

export function getPrototypeProducts(): Product[] {
    // Returns a static, predictable list for consistent server/client rendering.
    return initialPrototypeProducts;
}


// In-memory/session storage for prototype orders
const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';

export type PrototypeOrder = Omit<Order, 'createdAt'> & { createdAt: string };


// Seed data for prototype orders to ensure the app is usable from the start.
const initialPrototypeOrders: PrototypeOrder[] = [
    {
        id: 'proto-order-1',
        userId: 'proto-buyer',
        customerName: 'Comprador Proto',
        items: [
            { ...initialPrototypeProducts[0], quantity: 2 },
            { ...initialPrototypeProducts[2], quantity: 2 }
        ],
        deliveryFee: 4.50,
        total: (9.99 * 2) + (2.50 * 2) + 4.50,
        status: 'Pedido Realizado',
        createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
        storeId: 'proto-store-id',
        storeName: prototypeStore.name,
        storeAddress: prototypeStore.address,
        shippingAddress: { name: 'Comprador Proto', address: 'Calle Falsa 123' },
        deliveryPersonId: null,
        deliveryPersonName: null,
    },
    {
        id: 'proto-order-2',
        userId: 'some-other-user',
        customerName: 'Juan Pérez',
        items: [
             { ...initialPrototypeProducts[1], quantity: 1 }
        ],
        deliveryFee: 6.00,
        total: 12.99 + 6.00,
        status: 'En preparación',
        createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(), // 20 minutes ago
        storeId: 'proto-store-id',
        storeName: prototypeStore.name,
        storeAddress: prototypeStore.address,
        shippingAddress: { name: 'Juan Pérez', address: 'Avenida Siempre Viva 742' },
        deliveryPersonId: null,
        deliveryPersonName: null,
    }
];

// This is the single source of truth for prototype orders.
// It reads from session storage, and if it's empty, initializes it.
function getPrototypeOrdersFromSession(): PrototypeOrder[] {
    if (typeof window === 'undefined') {
        // On the server, always return the initial static data to avoid errors.
        return initialPrototypeOrders;
    }
    
    const ordersJson = sessionStorage.getItem(PROTOTYPE_ORDERS_KEY);
    
    if (ordersJson) {
        try {
            const parsedOrders = JSON.parse(ordersJson);
            if (Array.isArray(parsedOrders)) {
                return parsedOrders;
            }
        } catch (e) {
            console.error("Corrupted prototype orders in session storage, resetting.", e);
        }
    }
    
    // If we are here, it means sessionStorage is empty or corrupted, so we initialize it.
    sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
    return initialPrototypeOrders;
}


/**
 * Public function to get all prototype orders.
 * Reads from session storage and initializes it if empty.
 * Safe to call from both server and client.
 */
export function getPrototypeOrders(): PrototypeOrder[] {
    return getPrototypeOrdersFromSession();
}

/**
 * Saves a new prototype order to the session.
 */
export function savePrototypeOrder(order: PrototypeOrder) {
    if (typeof window === 'undefined') return;
    const existingOrders = getPrototypeOrdersFromSession();
    const updatedOrders = [...existingOrders, order];
    sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(updatedOrders));
}

/**
 * Updates an existing prototype order in the session.
 */
export function updatePrototypeOrder(orderId: string, updates: Partial<PrototypeOrder>) {
    if (typeof window === 'undefined') return;

    const orders = getPrototypeOrdersFromSession();
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex !== -1) {
        orders[orderIndex] = { ...orders[orderIndex], ...updates };
        sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(orders));
    }
}


export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Bonanza de Hamburguesas está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Estación de Sushi ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva reseña', description: 'Has recibido una nueva reseña para Paraíso de la Pizza.', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];
