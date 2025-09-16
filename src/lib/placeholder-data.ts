import placeholderImages from './placeholder-images.json';

const getImage = (id: string) => {
    const image = placeholderImages.placeholderImages.find(img => img.id === id);
    return image || { imageUrl: 'https://picsum.photos/seed/placeholder/600/400', imageHint: 'placeholder' };
}

export const stores = [
  { id: '1', name: 'Paraíso de la Pizza', category: 'Italiana', address: 'Calle Pizza 123', imageUrl: getImage('store-pizza').imageUrl, imageHint: getImage('store-pizza').imageHint },
  { id: '2', name: 'Bonanza de Hamburguesas', category: 'Comida Rápida', address: 'Bulevar Hamburguesa 456', imageUrl: getImage('store-burger').imageUrl, imageHint: getImage('store-burger').imageHint },
  { id: '3', name: 'Estación de Sushi', category: 'Japonesa', address: 'Avenida Sushi 789', imageUrl: getImage('store-sushi').imageUrl, imageHint: getImage('store-sushi').imageHint },
  { id: '4', name: 'Pueblo del Taco', category: 'Mexicana', address: 'Terrada del Taco 101', imageUrl: getImage('store-taco').imageUrl, imageHint: getImage('store-taco').imageHint },
  { id: '5', name: 'Santuario de Ensaladas', category: 'Saludable', address: 'Camino de la Ensalada 212', imageUrl: getImage('store-salad').imageUrl, imageHint: getImage('store-salad').imageHint },
  { id: '6', name: 'Sueños de Postre', category: 'Dulces', address: 'Corte del Pastel 313', imageUrl: getImage('store-dessert').imageUrl, imageHint: getImage('store-dessert').imageHint },
];

export const productsByStore = {
  '1': [
    { id: 'p1', name: 'Pizza Margarita', description: 'Queso clásico y tomate', price: 12.99 },
    { id: 'p2', name: 'Pizza de Pepperoni', description: 'Cargada de pepperoni', price: 14.99 },
    { id: 'p3', name: 'Pan de Ajo', description: 'Con queso mozzarella', price: 6.99 },
  ],
  '2': [
    { id: 'p4', name: 'Hamburguesa con Queso Clásica', description: 'Carne de res, queso, lechuga, tomate', price: 9.99 },
    { id: 'p5', name: 'Hamburguesa con Tocino', description: 'Con crujientes tiras de tocino', price: 11.99 },
    { id: 'p6', name: 'Papas Fritas', description: 'Papas fritas doradas y crujientes', price: 3.99 },
  ],
  '3': [
    { id: 'p7', name: 'Rollo California', description: 'Cangrejo, aguacate, pepino', price: 8.99 },
    { id: 'p8', name: 'Rollo de Atún Picante', description: 'Atún con mayonesa picante', price: 9.99 },
    { id: 'p9', name: 'Sopa Miso', description: 'Sopa tradicional japonesa', price: 2.99 },
  ],
  '4': [
    { id: 'p10', name: 'Tacos de Carne Asada', description: 'Tres tacos de carne asada a la parrilla', price: 10.99 },
    { id: 'p11', name: 'Burrito de Pollo', description: 'Relleno de pollo, arroz y frijoles', price: 11.99 },
  ],
  '5': [
    { id: 'p12', name: 'Ensalada César', description: 'Lechuga romana, crutones, parmesano', price: 9.50 },
    { id: 'p13', name: 'Ensalada Griega', description: 'Queso feta, aceitunas, pepino, tomate', price: 10.50 },
  ],
  '6': [
    { id: 'p14', name: 'Pastel de Lava de Chocolate', description: 'Centro tibio y derretido', price: 7.99 },
    { id: 'p15', name: 'Porción de Tarta de Queso', description: 'Tarta de queso estilo Nueva York', price: 6.99 },
  ],
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
];

export const getStoreById = (id: string) => stores.find(s => s.id === id);
export const getProductsByStoreId = (id: string) => productsByStore[id as keyof typeof productsByStore] || [];
export const getOrderById = (id: string) => orders.find(o => o.id === id);
