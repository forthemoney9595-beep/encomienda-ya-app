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

export type DeliveryPersonnel = {
  id: string;
  name: string;
  vehicle: string;
  zone: string;
  status: 'Activo' | 'Pendiente' | 'Inactivo' | 'Rechazado';
};


export const stores: Store[] = [
  // This data is now fetched from Firestore. See /lib/data-service.ts
  // You can add stores to the Firestore 'stores' collection to see them on the home page.
];

export const productsByStore: { [key: string]: Product[] } = {
  // This data is now fetched from Firestore. See /lib/data-service.ts
};

export const orders = [
  { id: 'ord1', storeName: 'Paraíso de la Pizza', total: 21.98, status: 'Entregado', date: '2024-07-20' },
  { id: 'ord2', storeName: 'Bonanza de Hamburguesas', total: 15.98, status: 'En reparto', date: '2024-07-21' },
  { id: 'ord3', storeName: 'Estación de Sushi', total: 12.98, status: 'En preparación', date: '2024-07-21' },
];

export const deliveryPersonnel: DeliveryPersonnel[] = [
    // This data is now fetched from Firestore. See /lib/data-service.ts
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
