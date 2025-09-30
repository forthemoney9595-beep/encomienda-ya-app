
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
};

export type UserProfile = {
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

let prototypeStoreInstance: Store = {
    id: 'proto-store-id',
    name: "Hamburguesas IA",
    category: "Comida Rápida",
    productCategories: ["Comida Rápida", "Bebidas"],
    address: "Av. Hamburguesa 456",
    ownerId: 'proto-store-owner',
    status: 'Aprobado',
    imageUrl: "https://picsum.photos/seed/burger/600/400",
    imageHint: "burger joint",
};

if (typeof window !== 'undefined') {
    const storedStore = sessionStorage.getItem('prototypeStore');
    if (storedStore) {
        prototypeStoreInstance = JSON.parse(storedStore);
    } else {
        sessionStorage.setItem('prototypeStore', JSON.stringify(prototypeStoreInstance));
    }
}
export const prototypeStore = prototypeStoreInstance;

export function updatePrototypeStore(store: Store) {
    if (typeof window === 'undefined') return;
    prototypeStoreInstance = store;
    sessionStorage.setItem('prototypeStore', JSON.stringify(store));
}


const PROTOTYPE_PRODUCTS_KEY = 'prototypeProducts';
let prototypeProductsInstance: Product[] = [
    { id: 'proto-prod-1', name: "Hamburguesa Clásica IA", description: "La clásica con queso, lechuga y tomate.", price: 9.99, category: 'Comida Rápida', imageUrl: "https://picsum.photos/seed/classicburger/200/200" },
    { id: 'proto-prod-2', name: "Hamburguesa Doble IA", description: "Doble carne, doble queso, para los con más hambre.", price: 12.99, category: 'Comida Rápida', imageUrl: "https://picsum.photos/seed/doubleburger/200/200" },
    { id: 'proto-prod-3', name: "Refresco", description: "Burbujas refrescantes.", price: 2.50, category: "Bebidas", imageUrl: "https://picsum.photos/seed/soda/200/200" },
];

if (typeof window !== 'undefined') {
    const storedProducts = sessionStorage.getItem(PROTOTYPE_PRODUCTS_KEY);
    if (storedProducts) {
        prototypeProductsInstance = JSON.parse(storedProducts);
    } else {
        sessionStorage.setItem(PROTOTYPE_PRODUCTS_KEY, JSON.stringify(prototypeProductsInstance));
    }
}
export const prototypeProducts = prototypeProductsInstance;

export function getPrototypeProducts(): Product[] {
    if (typeof window === 'undefined') return [];
    const productsJson = sessionStorage.getItem(PROTOTYPE_PRODUCTS_KEY);
    return productsJson ? JSON.parse(productsJson) : prototypeProductsInstance;
}

export function savePrototypeProduct(product: Product) {
    if (typeof window === 'undefined') return;
    const existingProducts = getPrototypeProducts();
    const updatedProducts = [...existingProducts, product];
    sessionStorage.setItem(PROTOTYPE_PRODUCTS_KEY, JSON.stringify(updatedProducts));
}


export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Bonanza de Hamburguesas está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Estación de Sushi ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva reseña', description: 'Has recibido una nueva reseña para Paraíso de la Pizza.', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];

// In-memory/session storage for prototype orders
const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';

export type PrototypeOrder = Omit<Order, 'createdAt'> & { createdAt: string };


export function savePrototypeOrder(order: PrototypeOrder) {
    if (typeof window === 'undefined') return;
    const existingOrders = getPrototypeOrders();
    const updatedOrders = [...existingOrders, order];
    sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(updatedOrders));
}

export function getPrototypeOrders(): PrototypeOrder[] {
    if (typeof window === 'undefined') return [];
    const ordersJson = sessionStorage.getItem(PROTOTYPE_ORDERS_KEY);
    return ordersJson ? JSON.parse(ordersJson) : [];
}

export function getPrototypeOrdersByStore(storeId: string): PrototypeOrder[] {
    if (typeof window === 'undefined') return [];
    const allOrders = getPrototypeOrders();
    return allOrders.filter(order => order.storeId === storeId);
}


export function getAvailablePrototypeOrdersForDelivery(): PrototypeOrder[] {
    if (typeof window === 'undefined') return [];
    const allOrders = getPrototypeOrders();
    return allOrders.filter(order => order.status === 'En preparación' && !order.deliveryPersonId);
}

export function getPrototypeOrdersByDeliveryPerson(driverId: string): PrototypeOrder[] {
    if (typeof window === 'undefined') return [];
    const allOrders = getPrototypeOrders();
    return allOrders.filter(order => order.deliveryPersonId === driverId && order.status === 'En reparto');
}
