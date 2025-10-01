

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
  products: Product[];
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

// Redefining Order types here to break circular dependency with order-service.
// This file should be pure data and type definitions with no code imports.
export type OrderStatus = 'Pedido Realizado' | 'En preparación' | 'En reparto' | 'Entregado' | 'Cancelado';

export interface CartItem extends Product {
  quantity: number;
}
export interface Order {
    id: string;
    userId: string;
    customerName: string;
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
    storeAddress?: string; 
    deliveryPersonId?: string;
    deliveryPersonName?: string;
    storeCoords?: { latitude: number; longitude: number };
    customerCoords?: { latitude: number; longitude: number };
}


export const prototypeUsers: Record<string, UserProfile> = {
    'admin@test.com': { uid: 'proto-admin', name: 'Admin Proto', email: 'admin@test.com', role: 'admin' },
    'repartidor@test.com': { uid: 'proto-delivery', name: 'Repartidor Proto', email: 'repartidor@test.com', role: 'delivery' },
    'comprador@test.com': { uid: 'proto-buyer', name: 'Comprador Proto', email: 'comprador@test.com', role: 'buyer' },
    'tienda@test.com': { uid: 'proto-store-owner', name: 'Dueño Tienda Proto', email: 'tienda@test.com', role: 'store' },
};

// --- STORES AND PRODUCTS ---

// The initial stores are now an empty array to allow for manual creation.
export const initialPrototypeStores: Store[] = [];

export function getPrototypeProducts(storeId?: string): Product[] {
  if (!storeId) return [];
  const store = initialPrototypeStores.find(s => s.id === storeId);
  return store ? store.products : [];
}


const protoDeliveryUser = Object.values(prototypeUsers).find(u => u.role === 'delivery');
export const prototypeDelivery: DeliveryPersonnel = {
    id: protoDeliveryUser!.uid,
    name: protoDeliveryUser!.name,
    email: protoDeliveryUser!.email,
    status: 'Pendiente',
    vehicle: 'motocicleta',
    zone: 'Centro'
};


// --- ORDERS ---

// In-memory/session storage for prototype orders
export const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';

// Seed data for prototype orders is now empty.
export const initialPrototypeOrders: Order[] = [];


export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Estación de Sushi está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Paraíso de la Pizza ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva tienda aprobada', description: '¡Paraíso de la Pizza ya está disponible!', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];
