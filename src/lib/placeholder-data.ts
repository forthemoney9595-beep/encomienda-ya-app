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
  rating?: number;
  deliveryTime?: string;
  minOrder?: number;
  products?: Product[];
  productCategories?: string[];
  ownerId?: string;
  horario?: string;
  
  // ✅ Estado de aprobación
  isApproved?: boolean; 
  status?: string;          
  maintenanceMode?: boolean; 
  ownerName?: string;       

  // ✅ NUEVO: Comisión que la plataforma le cobra a ESTA tienda (ej: 10)
  commissionRate?: number;

  cuit?: string; // Cargado en /signup/store
}

export interface DeliveryPersonnel {
  id: string;
  name: string;
  email: string;
  status: 'Activo' | 'Rechazado' | 'Pendiente' | 'Inactivo' | string;
  vehicle?: 'motocicleta' | 'automovil' | 'bicicleta' | string | { type: string; model: string; plate: string; color: string };
  phoneNumber?: string;
  rating?: number;
  deliveriesCount?: number;
  zone?: string;
  profileImageUrl?: string;
  licenseUrl?: string;
  joinedDate?: string;
}

export interface UserProfile {
  id?: string;
  uid?: string;
  role: 'buyer' | 'store' | 'delivery' | 'admin';
  name: string;
  email: string;
  phoneNumber?: string;
  displayName?: string;
  profileImageUrl?: string;
  storeId?: string;
  addresses?: Address[];
  favoriteStores?: string[];
  favoriteProducts?: string[];
  isApproved?: boolean;
}

export interface Order {
  id: string;
  userId: string;
  customerName: string;
  customerPhoneNumber?: string; 
  storeId: string;
  storeName: string;
  storeAddress?: string;
  status: any; // OrderStatus
  items: any[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  paymentMethod: 'CARD';
  createdAt: Timestamp | Date;
  shippingInfo?: { name: string; address: string; };
  shippingAddress: { name: string; address: string; };
  deliveryPersonId?: string | null;
  deliveryPersonName?: string | null;
  readyForPickup?: boolean;
  storeCoords?: { latitude: number; longitude: number };
  customerCoords?: { latitude: number; longitude: number };
  deliveryRating?: number;
  deliveryReview?: string;

  // ✅ NUEVOS CAMPOS PARA FINANZAS
  payoutStatus?: 'pending' | 'paid'; 
  payoutDate?: any; 
}

export interface Address {
    id: string;
    label: 'Casa' | 'Oficina' | 'Otro' | string;
    street: string;
    city: string;
    zipCode: string;
    postalCode?: string;
}

// Tanda C: se eliminó el mock "Burger King" (export `stores`) — 0 importadores; era
// solo datos de ejemplo del scaffolding original.