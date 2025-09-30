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
    'tienda@test.com': { uid: 'proto-store-owner', name: 'Dueño Tienda Proto', email: 'tienda@test.com', role: 'store', storeId: 'proto-store-id', storeName: 'Tienda de Prueba IA' },
    'repartidor@test.com': { uid: 'proto-delivery', name: 'Repartidor Proto', email: 'repartidor@test.com', role: 'delivery', status: 'approved' },
    'comprador@test.com': { uid: 'proto-buyer', name: 'Comprador Proto', email: 'comprador@test.com', role: 'buyer' },
};


export const notifications = [
  { id: 'n1', title: '¡Pedido en camino!', description: 'Tu pedido de Bonanza de Hamburguesas está en camino.', date: 'hace 5 min' },
  { id: 'n2', title: 'Confirmación de pedido', description: 'Tu pedido de Estación de Sushi ha sido confirmado.', date: 'hace 1 hora' },
  { id: 'n3', title: 'Nueva reseña', description: 'Has recibido una nueva reseña para Paraíso de la Pizza.', date: 'hace 3 horas' },
  { id: 'n4', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];
