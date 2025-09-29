import placeholderImages from './placeholder-images.json';

const getImage = (id: string) => {
    const image = placeholderImages.placeholderImages.find(img => img.id === id);
    return image || { imageUrl: 'https://picsum.photos/seed/placeholder/600/400', imageHint: 'placeholder' };
}

export type Store = {
  id: string;
  name: string;
  category: string;
  address: string;
  imageUrl: string;
  imageHint: string;
  status: 'Aprobado' | 'Pendiente' | 'Rechazado';
}

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
}

export const stores: Store[] = [
  // This data is now fetched from Firestore. See /lib/data-service.ts
  // You can add stores to the Firestore 'stores' collection to see them on the home page.
];

export const productsByStore: { [key: string]: Product[] } = {
  '1': [
    { id: 'p1', name: 'Pizza Margarita', description: 'Queso clásico y tomate', price: 12.99, category: 'Pizzas' },
    { id: 'p2', name: 'Pizza de Pepperoni', description: 'Cargada de pepperoni', price: 14.99, category: 'Pizzas' },
    { id: 'p3', name: 'Pan de Ajo', description: 'Con queso mozzarella', price: 6.99, category: 'Entrantes' },
  ],
  '2': [
    { id: 'p4', name: 'Hamburguesa con Queso Clásica', description: 'Carne de res, queso, lechuga, tomate', price: 9.99, category: 'Hamburguesas' },
    { id: 'p5', name: 'Hamburguesa con Tocino', description: 'Con crujientes tiras de tocino', price: 11.99, category: 'Hamburguesas' },
    { id: 'p6', name: 'Papas Fritas', description: 'Papas fritas doradas y crujientes', price: 3.99, category: 'Acompañamientos' },
  ],
  '3': [
    { id: 'p7', name: 'Rollo California', description: 'Cangrejo, aguacate, pepino', price: 8.99, category: 'Rollos' },
    { id: 'p8', name: 'Rollo de Atún Picante', description: 'Atún con mayonesa picante', price: 9.99, category: 'Rollos' },
    { id: 'p9', name: 'Sopa Miso', description: 'Sopa tradicional japonesa', price: 2.99, category: 'Sopas' },
  ],
  '4': [
    { id: 'p10', name: 'Tacos de Carne Asada', description: 'Tres tacos de carne asada a la parrilla', price: 10.99, category: 'Tacos' },
    { id: 'p11', name: 'Burrito de Pollo', description: 'Relleno de pollo, arroz y frijoles', price: 11.99, category: 'Burritos' },
  ],
  '5': [
    { id: 'p12', name: 'Ensalada César', description: 'Lechuga romana, crutones, parmesano', price: 9.50, category: 'Ensaladas' },
    { id: 'p13', name: 'Ensalada Griega', description: 'Queso feta, aceitunas, pepino, tomate', price: 10.50, category: 'Ensaladas' },
  ],
  '6': [
    { id: 'p14', name: 'Pastel de Lava de Chocolate', description: 'Centro tibio y derretido', price: 7.99, category: 'Postres' },
    { id: 'p15', name: 'Porción de Tarta de Queso', description: 'Tarta de queso estilo Nueva York', price: 6.99, category: 'Postres' },
  ],
  '7': [],
};

export const orders = [
  { id: 'ord1', storeName: 'Paraíso de la Pizza', total: 21.98, status: 'Entregado', date: '2024-07-20' },
  { id: 'ord2', storeName: 'Bonanza de Hamburguesas', total: 15.98, status: 'En reparto', date: '2024-07-21' },
  { id: 'ord3', storeName: 'Estación de Sushi', total: 12.98, status: 'En preparación', date: '2024-07-21' },
];

export const deliveryPersonnel = [
    { id: 'd1', name: 'Juan Pérez', vehicle: 'Motocicleta', zone: 'Norte', status: 'Activo' },
    { id: 'd2', name: 'Ana Gómez', vehicle: 'Automóvil', zone: 'Sur', status: 'Activo' },
    { id: 'd3', name: 'Luis Rodríguez', vehicle: 'Bicicleta', zone: 'Centro', status: 'Inactivo' },
    { id: 'd4', name: 'Sofía Fernández', vehicle: 'Motocicleta', zone: 'Oeste', status: 'Activo' },
    { id: 'd5', name: 'Carlos Marín', vehicle: 'Motocicleta', zone: 'Norte', status: 'Pendiente' },
];

export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Bonanza de Hamburguesas está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Estación de Sushi ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva reseña', description: 'Has recibido una nueva reseña para Paraíso de la Pizza.', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];

export const getStoreById = (id: string) => stores.find(s => s.id === id);
export const getProductsByStoreId = (id: string) => productsByStore[id as keyof typeof productsByStore] || [];
export const getOrderById = (id: string) => orders.find(o => o.id === id);
