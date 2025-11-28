import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
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

// ✅ ACTUALIZADO: Incluye campos financieros y de contacto
export interface Order {
  id: string;
  userId: string;
  customerName: string;
  customerPhoneNumber?: string; 
  storeId: string;
  storeName: string;
  storeAddress?: string;
  status: OrderStatus;
  
  // Desglose de precios
  items: OrderItem[];
  subtotal?: number;
  deliveryFee: number;
  serviceFee?: number;
  total: number;
  
  createdAt: Timestamp | Date;
  
  shippingInfo?: {
    name: string;
    address: string;
  };
  
  shippingAddress: { // Mantener compatibilidad si usas ambos nombres
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

// ✅ ACTUALIZADO: Input para crear orden con nuevos campos
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
  
  // Campos financieros
  subtotal: number;
  deliveryFee: number;
  serviceFee?: number;
  total: number;
}

export const createOrder = async (db: Firestore, input: CreateOrderInput) => {
  if (!db) throw new Error("Firestore instance is required");

  // Coordenadas simuladas para demostración
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
    
    // Guardamos los valores calculados que vienen del input
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    serviceFee: input.serviceFee || 0,
    total: input.total,
    
    createdAt: serverTimestamp(),
    shippingAddress: input.shippingInfo,
    shippingInfo: input.shippingInfo,
    
    deliveryPersonId: null,
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