import placeholderImages from './placeholder-images.json';

const getImage = (id: string) => {
    const image = placeholderImages.placeholderImages.find(img => img.id === id);
    return image || { imageUrl: 'https://picsum.photos/seed/placeholder/600/400', imageHint: 'placeholder' };
}

export const stores = [
  { id: '1', name: 'Pizza Paradise', category: 'Italian', address: '123 Pizza Ln', imageUrl: getImage('store-pizza').imageUrl, imageHint: getImage('store-pizza').imageHint },
  { id: '2', name: 'Burger Bonanza', category: 'Fast Food', address: '456 Burger Blvd', imageUrl: getImage('store-burger').imageUrl, imageHint: getImage('store-burger').imageHint },
  { id: '3', name: 'Sushi Station', category: 'Japanese', address: '789 Sushi St', imageUrl: getImage('store-sushi').imageUrl, imageHint: getImage('store-sushi').imageHint },
  { id: '4', name: 'Taco Town', category: 'Mexican', address: '101 Taco Ter', imageUrl: getImage('store-taco').imageUrl, imageHint: getImage('store-taco').imageHint },
  { id: '5', name: 'Salad Sanctuary', category: 'Healthy', address: '212 Salad Way', imageUrl: getImage('store-salad').imageUrl, imageHint: getImage('store-salad').imageHint },
  { id: '6', name: 'Dessert Dreams', category: 'Sweets', address: '313 Cake Ct', imageUrl: getImage('store-dessert').imageUrl, imageHint: getImage('store-dessert').imageHint },
];

export const productsByStore = {
  '1': [
    { id: 'p1', name: 'Margherita Pizza', description: 'Classic cheese and tomato', price: 12.99 },
    { id: 'p2', name: 'Pepperoni Pizza', description: 'Loaded with pepperoni', price: 14.99 },
    { id: 'p3', name: 'Garlic Bread', description: 'With mozzarella cheese', price: 6.99 },
  ],
  '2': [
    { id: 'p4', name: 'Classic Cheeseburger', description: 'Beef patty, cheese, lettuce, tomato', price: 9.99 },
    { id: 'p5', name: 'Bacon Burger', description: 'With crispy bacon strips', price: 11.99 },
    { id: 'p6', name: 'Fries', description: 'Golden crispy fries', price: 3.99 },
  ],
  '3': [
    { id: 'p7', name: 'California Roll', description: 'Crab, avocado, cucumber', price: 8.99 },
    { id: 'p8', name: 'Spicy Tuna Roll', description: 'Tuna with spicy mayo', price: 9.99 },
    { id: 'p9', name: 'Miso Soup', description: 'Traditional Japanese soup', price: 2.99 },
  ],
  '4': [
    { id: 'p10', name: 'Carne Asada Tacos', description: 'Three grilled steak tacos', price: 10.99 },
    { id: 'p11', name: 'Chicken Burrito', description: 'Stuffed with chicken, rice, beans', price: 11.99 },
  ],
  '5': [
    { id: 'p12', name: 'Caesar Salad', description: 'Romaine, croutons, parmesan', price: 9.50 },
    { id: 'p13', name: 'Greek Salad', description: 'Feta, olives, cucumber, tomato', price: 10.50 },
  ],
  '6': [
    { id: 'p14', name: 'Chocolate Lava Cake', description: 'Warm, gooey center', price: 7.99 },
    { id: 'p15', name: 'Cheesecake Slice', description: 'New York style cheesecake', price: 6.99 },
  ],
};

export const orders = [
  { id: 'ord1', storeName: 'Pizza Paradise', total: 21.98, status: 'Delivered', date: '2024-07-20' },
  { id: 'ord2', storeName: 'Burger Bonanza', total: 15.98, status: 'Out for Delivery', date: '2024-07-21' },
  { id: 'ord3', storeName: 'Sushi Station', total: 12.98, status: 'Preparing', date: '2024-07-21' },
];

export const deliveryPersonnel = [
    { id: 'd1', name: 'John Doe', vehicle: 'Motorcycle', zone: 'North', status: 'Active' },
    { id: 'd2', name: 'Jane Smith', vehicle: 'Car', zone: 'South', status: 'Active' },
    { id: 'd3', name: 'Mike Ross', vehicle: 'Bicycle', zone: 'Downtown', status: 'Inactive' },
    { id: 'd4', name: 'Rachel Zane', vehicle: 'Motorcycle', zone: 'West', status: 'Active' },
];

export const getStoreById = (id: string) => stores.find(s => s.id === id);
export const getProductsByStoreId = (id: string) => productsByStore[id as keyof typeof productsByStore] || [];
export const getOrderById = (id: string) => orders.find(o => o.id === id);
