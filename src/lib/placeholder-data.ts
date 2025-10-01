

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
    'tienda@test.com': { uid: 'proto-store-owner', name: 'Dueño Tienda Proto', email: 'tienda@test.com', role: 'store', storeId: 'proto-store-burger' },
    'tienda-pizza@test.com': { uid: 'proto-store-pizza-owner', name: 'Dueña Pizza Proto', email: 'tienda-pizza@test.com', role: 'store', storeId: 'proto-store-pizza' },
    'repartidor@test.com': { uid: 'proto-delivery', name: 'Repartidor Proto', email: 'repartidor@test.com', role: 'delivery' },
    'comprador@test.com': { uid: 'proto-buyer', name: 'Comprador Proto', email: 'comprador@test.com', role: 'buyer' },
};

// --- STORES AND PRODUCTS ---

const prototypeProductsBurger: Product[] = [
    { id: 'proto-prod-1', name: "Hamburguesa Clásica IA", description: "La clásica con queso, lechuga y tomate.", price: 9.99, category: 'Comida', imageUrl: "https://picsum.photos/seed/classicburger/200/200" },
    { id: 'proto-prod-2', name: "Hamburguesa Doble IA", description: "Doble carne, doble queso, para los con más hambre.", price: 12.99, category: 'Comida', imageUrl: "https://picsum.photos/seed/doubleburger/200/200" },
    { id: 'proto-prod-3', name: "Refresco", description: "Burbujas refrescantes.", price: 2.50, category: "Bebidas", imageUrl: "https://picsum.photos/seed/soda/200/200" },
];

const prototypeProductsPizza: Product[] = [
    { id: 'proto-prod-4', name: "Pizza Margarita", description: "La simpleza perfecta: tomate, mozzarella y albahaca.", price: 14.50, category: 'Pizzas', imageUrl: "https://picsum.photos/seed/margarita/200/200" },
    { id: 'proto-prod-5', name: "Pizza Pepperoni", description: "Un clásico que nunca falla.", price: 16.00, category: 'Pizzas', imageUrl: "https://picsum.photos/seed/pepperoni/200/200" },
    { id: 'proto-prod-6', name: "Ensalada César", description: "Lechuga fresca, crutones y aderezo especial.", price: 8.50, category: 'Ensaladas', imageUrl: "https://picsum.photos/seed/caesarsalad/200/200" },
];

const prototypeProductsSushi: Product[] = [
    { id: 'proto-prod-7', name: "Rollo California", description: "Cangrejo, aguacate y pepino.", price: 11.00, category: 'Rollos', imageUrl: "https://picsum.photos/seed/california/200/200" },
    { id: 'proto-prod-8', name: "Nigiri de Salmón", description: "Fresco salmón sobre arroz de sushi.", price: 5.00, category: 'Nigiris', imageUrl: "https://picsum.photos/seed/salmonigiri/200/200" },
    { id: 'proto-prod-9', name: "Té Verde", description: "El acompañamiento perfecto.", price: 3.00, category: 'Bebidas', imageUrl: "https://picsum.photos/seed/greentea/200/200" },
];

const prototypeProductsClothing: Product[] = [
    { id: 'proto-prod-10', name: "Camiseta Básica", description: "Algodón 100% de alta calidad.", price: 19.99, category: 'Camisetas', imageUrl: "https://picsum.photos/seed/tshirt/200/200" },
    { id: 'proto-prod-11', name: "Pantalones Vaqueros", description: "Corte moderno y cómodo.", price: 49.99, category: 'Pantalones', imageUrl: "https://picsum.photos/seed/jeans/200/200" },
];

const prototypeProductsBooks: Product[] = [
    { id: 'proto-prod-12', name: "La Sombra del Viento", description: "Una novela de misterio y romance en Barcelona.", price: 22.50, category: 'Ficción', imageUrl: "https://picsum.photos/seed/fictionbook/200/200" },
    { id: 'proto-prod-13', name: "Sapiens: De animales a dioses", description: "Una breve historia de la humanidad.", price: 25.00, category: 'No Ficción', imageUrl: "https://picsum.photos/seed/nonfictionbook/200/200" },
];


export const initialPrototypeStores: Store[] = [
    {
        id: 'proto-store-burger',
        name: "Hamburguesas IA",
        category: "Comida Rápida",
        productCategories: ["Comida", "Bebidas"],
        address: "Av. Hamburguesa 456",
        ownerId: 'proto-store-owner',
        status: 'Pendiente',
        imageUrl: "https://picsum.photos/seed/burger/600/400",
        imageHint: "burger joint",
        products: prototypeProductsBurger,
    },
    {
        id: 'proto-store-pizza',
        name: "Paraíso de la Pizza",
        category: "Italiana",
        productCategories: ["Pizzas", "Ensaladas"],
        address: "Calle Pizza 123",
        ownerId: 'proto-store-pizza-owner',
        status: 'Aprobado',
        imageUrl: "https://picsum.photos/seed/pizzaplace/600/400",
        imageHint: "pizza restaurant",
        products: prototypeProductsPizza,
    },
    {
        id: 'proto-store-sushi',
        name: "Estación de Sushi",
        category: "Japonesa",
        productCategories: ["Rollos", "Nigiris", "Bebidas"],
        address: "Ruta del Sashimi 789",
        ownerId: 'some-other-owner',
        status: 'Aprobado',
        imageUrl: "https://picsum.photos/seed/sushiplace/600/400",
        imageHint: "sushi bar",
        products: prototypeProductsSushi,
    },
    {
        id: 'proto-store-clothing',
        name: "Estilo Urbano",
        category: "Ropa",
        productCategories: ["Camisetas", "Pantalones"],
        address: "Plaza de la Moda 101",
        ownerId: 'another-owner-id',
        status: 'Aprobado',
        imageUrl: "https://picsum.photos/seed/clothingstore/600/400",
        imageHint: "clothing store",
        products: prototypeProductsClothing,
    },
    {
        id: 'proto-store-books',
        name: "El Rincón del Lector",
        category: "Otros",
        productCategories: ["Ficción", "No Ficción"],
        address: "Paseo del Saber 202",
        ownerId: 'yet-another-owner-id',
        status: 'Aprobado',
        imageUrl: "https://picsum.photos/seed/bookstore/600/400",
        imageHint: "bookstore",
        products: prototypeProductsBooks,
    }
];

export const prototypeStore = initialPrototypeStores[0];
export function getPrototypeProducts(storeId?: string): Product[] {
  if (!storeId) return initialPrototypeStores[0].products;
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

// Seed data for prototype orders. This is the initial state.
export const initialPrototypeOrders: Order[] = [
    {
        id: 'proto-order-1',
        userId: 'proto-buyer',
        customerName: 'Comprador Proto',
        items: [
            { ...prototypeProductsPizza[0], quantity: 1 }, // Pizza Margarita
            { ...prototypeProductsPizza[2], quantity: 1 }  // Ensalada
        ],
        deliveryFee: 4.50,
        total: (14.50 + 8.50) + 4.50,
        status: 'Entregado',
        createdAt: new Date(Date.now() - 1000 * 60 * 65), // 65 mins ago
        storeId: 'proto-store-pizza',
        storeName: "Paraíso de la Pizza",
        storeAddress: "Calle Pizza 123",
        shippingAddress: { name: 'Comprador Proto', address: 'Calle Falsa 123' },
        deliveryPersonId: 'proto-delivery',
        deliveryPersonName: 'Repartidor Proto',
        storeCoords: { latitude: 34.0522, longitude: -118.2437 },
        customerCoords: { latitude: 40.7128, longitude: -74.0060 },
    },
    {
        id: 'proto-order-2',
        userId: 'proto-buyer',
        customerName: 'Comprador Proto',
        items: [
             { ...prototypeProductsSushi[0], quantity: 2 } // Rollo California
        ],
        deliveryFee: 6.00,
        total: (11.00 * 2) + 6.00,
        status: 'En reparto',
        createdAt: new Date(Date.now() - 1000 * 60 * 20), // 20 mins ago
        storeId: 'proto-store-sushi',
        storeName: "Estación de Sushi",
        storeAddress: "Ruta del Sashimi 789",
        shippingAddress: { name: 'Comprador Proto', address: 'Avenida Siempre Viva 742' },
        deliveryPersonId: 'proto-delivery',
        deliveryPersonName: 'Repartidor Proto',
        storeCoords: { latitude: 34.0522, longitude: -118.2437 },
        customerCoords: { latitude: 35.6895, longitude: 139.6917 },
    },
    {
        id: 'proto-order-3',
        userId: 'some-other-buyer-id', // Belongs to another user, won't show for proto-buyer
        customerName: 'Juan Pérez',
        items: [ { ...prototypeProductsBurger[2], quantity: 4 } ],
        deliveryFee: 3.20,
        total: (2.50 * 4) + 3.20,
        status: 'En preparación',
        createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 mins ago
        storeId: 'proto-store-burger',
        storeName: "Hamburguesas IA",
        storeAddress: "Av. Hamburguesa 456",
        shippingAddress: { name: 'Juan Pérez', address: 'Boulevard de los Sueños Rotos' },
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
        storeCoords: { latitude: 48.8566, longitude: 2.3522 },
        customerCoords: { latitude: 48.8584, longitude: 2.2945 },
    },
    {
        id: 'proto-order-4',
        userId: 'proto-buyer',
        customerName: 'Comprador Proto',
        items: [
             { ...prototypeProductsPizza[1], quantity: 1 } // Pizza Pepperoni
        ],
        deliveryFee: 3.80,
        total: 16.00 + 3.80,
        status: 'En preparación',
        createdAt: new Date(Date.now() - 1000 * 60 * 5), // 5 mins ago
        storeId: 'proto-store-pizza',
        storeName: "Paraíso de la Pizza",
        storeAddress: "Calle Pizza 123",
        shippingAddress: { name: 'Comprador Proto', address: 'Calle Falsa 123' },
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
        storeCoords: { latitude: 48.8566, longitude: 2.3522 },
        customerCoords: { latitude: 48.8584, longitude: 2.2945 },
    },
    {
        id: 'proto-order-5',
        userId: 'proto-buyer',
        customerName: 'Comprador Proto',
        items: [
             { ...prototypeProductsClothing[0], quantity: 2 } // Camisetas
        ],
        deliveryFee: 7.10,
        total: (19.99 * 2) + 7.10,
        status: 'Pedido Realizado',
        createdAt: new Date(Date.now() - 1000 * 60 * 120), // 120 mins ago
        storeId: 'proto-store-clothing',
        storeName: "Estilo Urbano",
        storeAddress: "Plaza de la Moda 101",
        shippingAddress: { name: 'Comprador Proto', address: 'Avenida Siempre Viva 742' },
        deliveryPersonId: undefined,
        deliveryPersonName: undefined,
        storeCoords: { latitude: 51.5074, longitude: -0.1278 },
        customerCoords: { latitude: 51.5098, longitude: -0.0789 },
    }
];


export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Estación de Sushi está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Paraíso de la Pizza ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva tienda aprobada', description: '¡Paraíso de la Pizza ya está disponible!', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];
