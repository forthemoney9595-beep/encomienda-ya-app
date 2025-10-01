

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

// Re-defining Order types here to avoid circular dependency
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

export const initialPrototypeProducts: Product[] = [
    { id: 'proto-prod-1', name: "Hamburguesa Clásica IA", description: "La clásica con queso, lechuga y tomate.", price: 9.99, category: 'Comida', imageUrl: "https://picsum.photos/seed/classicburger/200/200" },
    { id: 'proto-prod-2', name: "Hamburguesa Doble IA", description: "Doble carne, doble queso, para los con más hambre.", price: 12.99, category: 'Comida', imageUrl: "https://picsum.photos/seed/doubleburger/200/200" },
    { id: 'proto-prod-3', name: "Refresco", description: "Burbujas refrescantes.", price: 2.50, category: "Bebida", imageUrl: "https://picsum.photos/seed/soda/200/200" },
];

export function getPrototypeProducts(): Product[] {
    return initialPrototypeProducts;
}


// In-memory/session storage for prototype orders
export const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';

// Seed data for prototype orders. This is the initial state.
export const initialPrototypeOrders: Order[] = [
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
        createdAt: new Date(Date.now() - 1000 * 60 * 5),
        storeId: 'proto-store-id',
        storeName: prototypeStore.name,
        storeAddress: prototypeStore.address,
        shippingAddress: { name: 'Comprador Proto', address: 'Calle Pizza 123' },
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
        storeCoords: { lat: 34.0522, lon: -118.2437 }, // LA
        customerCoords: { lat: 40.7128, lon: -74.0060 }, // NYC
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
        createdAt: new Date(Date.now() - 1000 * 60 * 20),
        storeId: 'proto-store-id',
        storeName: prototypeStore.name,
        storeAddress: prototypeStore.address,
        shippingAddress: { name: 'Juan Pérez', address: 'Paseo Sushi 789' },
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
        storeCoords: { lat: 34.0522, lon: -118.2437 }, // LA
        customerCoords: { lat: 35.6895, lon: 139.6917 }, // Tokyo
    }
];


export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Bonanza de Hamburguesas está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Estación de Sushi ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva reseña', description: 'Has recibido una nueva reseña para Paraíso de la Pizza.', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];
