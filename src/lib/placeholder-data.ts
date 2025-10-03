

import { getPlaceholderImage } from "./placeholder-images";

export type Store = {
  id: string;
  name: string;
  category: string;
  address: string;
  horario: string;
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
  rating: number;
  reviewCount: number;
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
export type OrderStatus = 'Pendiente de Confirmación' | 'Pendiente de Pago' | 'En preparación' | 'En reparto' | 'Entregado' | 'Cancelado' | 'Rechazado';


export interface CartItem extends Product {
  quantity: number;
  userRating?: number; // New field to track if user has rated this item in this order
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
    deliveryRating?: number;
    deliveryReview?: string;
}

export type Notification = {
  id: string;
  title: string;
  description: string;
  date: string;
};


export const prototypeUsers: Record<string, UserProfile> = {
    'admin@test.com': { uid: 'proto-admin', name: 'Admin Proto', email: 'admin@test.com', role: 'admin' },
    'tienda@test.com': { uid: 'proto-store-owner', name: 'Dueño Tienda Proto', email: 'tienda@test.com', role: 'store', storeId: 'proto-store-pizza' },
    'repartidor@test.com': { uid: 'proto-delivery', name: 'Repartidor Proto', email: 'repartidor@test.com', role: 'delivery' },
    'comprador@test.com': { uid: 'proto-buyer', name: 'Comprador Proto', email: 'comprador@test.com', role: 'buyer' },
};

// --- STORES AND PRODUCTS ---

const pizzaProducts: Product[] = [
    { id: 'prod-p1', name: 'Pizza Margarita', description: 'Clásica pizza con tomate, mozzarella y albahaca fresca.', price: 12.99, category: 'Pizzas', imageUrl: getPlaceholderImage('pizza-margarita', 200, 200), rating: 4.5, reviewCount: 120 },
    { id: 'prod-p2', name: 'Pizza Pepperoni', description: 'Cubierta con abundante pepperoni y queso mozzarella.', price: 14.99, category: 'Pizzas', imageUrl: getPlaceholderImage('pizza-pepperoni', 200, 200), rating: 4.8, reviewCount: 250 },
    { id: 'prod-p3', name: 'Pizza Hawaiana', description: 'Polémica pero deliciosa, con jamón y piña.', price: 15.50, category: 'Pizzas', imageUrl: getPlaceholderImage('pizza-hawaiian', 200, 200), rating: 4.2, reviewCount: 85 },
    { id: 'prod-p4', name: 'Refresco de Cola', description: 'Lata de 330ml, el acompañante perfecto.', price: 2.50, category: 'Bebidas', imageUrl: getPlaceholderImage('coca-cola', 200, 200), rating: 4.9, reviewCount: 500 },
    { id: 'prod-p5', name: 'Agua Mineral', description: 'Botella de 500ml.', price: 1.50, category: 'Bebidas', imageUrl: getPlaceholderImage('agua-mineral', 200, 200), rating: 4.7, reviewCount: 300 },
    { id: 'prod-p6', name: 'Tiramisú', description: 'Postre italiano clásico con café y cacao.', price: 6.99, category: 'Postres', imageUrl: getPlaceholderImage('tiramisu', 200, 200), rating: 4.9, reviewCount: 180 },
];

const sushiProducts: Product[] = [
    { id: 'prod-s1', name: 'Rollo California', description: 'Cangrejo, aguacate y pepino.', price: 8.99, category: 'Rollos', imageUrl: getPlaceholderImage('rollo-california', 200, 200), rating: 4.6, reviewCount: 95 },
    { id: 'prod-s2', name: 'Nigiri de Salmón', description: 'Dos piezas de salmón fresco sobre arroz.', price: 5.99, category: 'Nigiris', imageUrl: getPlaceholderImage('nigiri-salmon', 200, 200), rating: 4.8, reviewCount: 110 },
    { id: 'prod-s3', name: 'Sopa de Miso', description: 'Tradicional sopa japonesa con tofu y algas.', price: 3.50, category: 'Entrantes', imageUrl: getPlaceholderImage('sopa-miso', 200, 200), rating: 4.4, reviewCount: 70 },
    { id: 'prod-s4', name: 'Té Verde', description: 'Caliente y reconfortante.', price: 2.00, category: 'Bebidas', imageUrl: getPlaceholderImage('te-verde', 200, 200), rating: 4.7, reviewCount: 150 },
];

export const initialPrototypeStores: Store[] = [
    {
        id: 'proto-store-pizza',
        name: 'Paraíso de la Pizza',
        category: 'comida-rapida',
        address: 'Calle Falsa 123, Ciudad Prototipo',
        horario: 'Lun-Dom: 11:00 AM - 10:00 PM',
        imageUrl: getPlaceholderImage('store-pizza', 600, 400),
        imageHint: 'pizza restaurant',
        status: 'Aprobado',
        ownerId: 'proto-store-owner',
        productCategories: ['Pizzas', 'Bebidas', 'Postres'],
        products: pizzaProducts
    },
    {
        id: 'proto-store-sushi',
        name: 'Sushi del Rey',
        category: 'japonesa',
        address: 'Avenida Siempre Viva 742, Ciudad Prototipo',
        horario: 'Mar-Dom: 12:00 PM - 9:00 PM',
        imageUrl: getPlaceholderImage('store-sushi', 600, 400),
        imageHint: 'sushi bar',
        status: 'Aprobado',
        ownerId: 'proto-store-owner-2', // Belongs to a different, non-loggable owner for variety
        productCategories: ['Rollos', 'Nigiris', 'Entrantes', 'Bebidas'],
        products: sushiProducts
    }
];

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
    status: 'Activo',
    vehicle: 'motocicleta',
    zone: 'Centro'
};


// --- ORDERS ---

// In-memory/session storage for prototype orders
export const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';

// Seed data for prototype orders is now empty.
export const initialPrototypeOrders: Order[] = [];


export const initialPrototypeNotifications: Notification[] = [
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];

    