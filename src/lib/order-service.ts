import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  Firestore, 
  Timestamp 
} from 'firebase/firestore';

export type OrderStatus = 
  | 'Pendiente de Confirmación'
  | 'Pendiente de Pago'
  | 'En preparación'
  | 'En reparto'
  | 'Entregado'
  | 'Cancelado'
  | 'Rechazado';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  userRating?: number;
  description?: string;
  category?: string;
  imageUrl?: string;
}

export interface Order {
  id: string;
  userId: string;
  customerName: string;
  customerPhoneNumber?: string; 
  storeId: string;
  storeName: string;
  storeAddress?: string;
  status: OrderStatus;
  
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  paymentMethod: string;
  
  createdAt: Timestamp | Date;
  
  shippingInfo?: {
    name: string;
    address: string;
  };
  
  shippingAddress: { 
    name: string;
    address: string;
  };

  deliveryPersonId?: string | null;
  deliveryPersonName?: string | null;
  readyForPickup?: boolean;
  
  storeCoords?: { latitude: number; longitude: number };
  customerCoords?: { latitude: number; longitude: number };
  
  deliveryRating?: number;
  deliveryReview?: string;
}

export interface CreateOrderInput {
  userId: string;
  customerName: string;
  customerPhoneNumber: string; 
  storeId: string;
  storeName: string;
  storeAddress: string;
  items: any[];
  shippingInfo: {
    name: string;
    address: string;
  };
  
  subtotal: number;
  deliveryFee: number;
  serviceFee?: number;
  total: number;
  paymentMethod: string;
}

const PLATFORM_FEE_PERCENTAGE = 0.05; 
const DEFAULT_DELIVERY_FEE = 2000; 

export const OrderService = {
    calculateTotals: (subtotal: number) => {
        const serviceFee = Math.round(subtotal * PLATFORM_FEE_PERCENTAGE);
        const deliveryFee = DEFAULT_DELIVERY_FEE;
        const total = subtotal + serviceFee + deliveryFee;

        return {
            subtotal,
            serviceFee,
            deliveryFee,
            total
        };
    }
};

export const createOrder = async (db: Firestore, input: CreateOrderInput) => {
  if (!db) throw new Error("Firestore instance is required");

  // Coordenadas simuladas para demostración (Catamarca)
  const mockStoreCoords = { latitude: -28.46957, longitude: -65.77954 }; 
  const mockCustomerCoords = { 
      latitude: mockStoreCoords.latitude + (Math.random() * 0.01 - 0.005), 
      longitude: mockStoreCoords.longitude + (Math.random() * 0.01 - 0.005) 
  };

  const orderData = {
    userId: input.userId,
    customerName: input.customerName,
    customerPhoneNumber: input.customerPhoneNumber, 
    storeId: input.storeId,
    storeName: input.storeName,
    storeAddress: input.storeAddress,
    status: 'Pendiente de Confirmación' as OrderStatus,
    
    items: input.items,
    
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    serviceFee: input.serviceFee || 0,
    total: input.total,
    paymentMethod: input.paymentMethod,
    
    createdAt: serverTimestamp(),
    shippingAddress: input.shippingInfo,
    shippingInfo: input.shippingInfo,
    
    // ✅ FIX: Casteamos el null para que TypeScript no se queje
    deliveryPersonId: null as string | null,
    readyForPickup: false,
    
    storeCoords: mockStoreCoords,
    customerCoords: mockCustomerCoords,
  };

  const docRef = await addDoc(collection(db, 'orders'), orderData);
  return { id: docRef.id, ...orderData };
};

export const updateOrderStatus = async (db: Firestore, orderId: string, status: OrderStatus) => {
  if (!db) throw new Error("Firestore instance is required");
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, { status });
};