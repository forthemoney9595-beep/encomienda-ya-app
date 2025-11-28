import { Timestamp } from 'firebase/firestore';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  category: string;
  rating: number; 
  reviewCount: number;
  imageHint?: string;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  category: string;
  imageUrl: string;
  imageHint?: string;
  rating: number;
  deliveryTime: string;
  minOrder: number;
  products?: Product[];
  ownerId?: string;
  horario?: string;
  
  // ✅ CORRECCIÓN CLAVE: Agregamos isApproved para resolver el error en page.tsx
  isApproved?: boolean; 
}

export interface Address {
    id: string;
    label: string;
    street: string;
    city: string;
    zipCode: string;
}

// Datos de ejemplo
export const stores: Store[] = [
  {
    id: '1',
    name: 'Burger King',
    address: 'Av. Principal 123',
    category: 'Comida Rápida',
    imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=80',
    rating: 4.5,
    deliveryTime: '30-45 min',
    minOrder: 15,
    products: [
      { 
          id: 'p1', 
          name: 'Whopper', 
          description: 'La clásica hamburguesa a la parrilla.', 
          price: 8.50, 
          category: 'Hamburguesas',
          rating: 4.8,
          reviewCount: 120
      }
    ],
    isApproved: true, // Agregado para consistencia
  }
];