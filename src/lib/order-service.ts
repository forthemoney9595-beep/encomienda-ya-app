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

// 1. Definimos estrictamente el único método de pago permitido
export type PaymentMethod = 'CARD';

export type OrderStatus = 
  | 'Pendiente de Confirmación' // PASO 1: Tienda verifica Stock
  | 'Pendiente de Pago'         // PASO 2: Cliente paga con Tarjeta
  | 'En preparación'            // PASO 3: Tienda cocina/prepara
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
  paymentMethod: PaymentMethod; // Forzado a CARD
  
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

// Eliminamos paymentMethod del input, ya que lo inyectamos nosotros
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
    },

    sendNotification: async (db: Firestore, userId: string, title: string, message: string, type: string, orderId?: string) => {
        try {
            await addDoc(collection(db, 'notifications'), {
                userId,
                title,
                message,
                type, // 'order_status' | 'info'
                orderId,
                read: false,
                createdAt: serverTimestamp(),
                icon: 'bell'
            });
        } catch (error) {
            console.error("Error enviando notificación:", error);
        }
    }
};

export const createOrder = async (db: Firestore, input: CreateOrderInput) => {
  if (!db) throw new Error("Firestore instance is required");

  // TODO: En Fase 2 (Geolocalización), reemplazar estos mocks con datos reales del input
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
    
    // ✅ CAMBIO PARA FLUJO DE STOCK:
    // El pedido nace esperando confirmación de la tienda.
    status: 'Pendiente de Confirmación' as OrderStatus,
    
    items: input.items,
    
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    serviceFee: input.serviceFee || 0,
    total: input.total,
    
    // FORZADO: Eliminamos cualquier posibilidad de efectivo
    paymentMethod: 'CARD' as PaymentMethod,
    
    createdAt: serverTimestamp(),
    shippingAddress: input.shippingInfo,
    shippingInfo: input.shippingInfo,
    
    deliveryPersonId: null as string | null,
    readyForPickup: false,
    
    storeCoords: mockStoreCoords,
    customerCoords: mockCustomerCoords,
  };

  // 1. Crear la orden
  const docRef = await addDoc(collection(db, 'orders'), orderData);

  // 2. ✅ LOGICA RESTAURADA: Notificar a la tienda para VALIDAR STOCK
  try {
      const storeDoc = await getDoc(doc(db, 'stores', input.storeId));
      if (storeDoc.exists()) {
          const storeData = storeDoc.data();
          const ownerId = storeData.ownerId; 
          
          if (ownerId) {
              await OrderService.sendNotification(
                  db, 
                  ownerId, 
                  "🔔 Solicitud de Pedido", 
                  `Nuevo pedido de ${input.customerName}. Por favor confirma stock.`, 
                  "order_status",
                  docRef.id
              );
          }
      }
  } catch (error) {
      console.error("Error notificando a la tienda:", error);
  }

  return { id: docRef.id, ...orderData };
};

export const updateOrderStatus = async (db: Firestore, orderId: string, status: OrderStatus) => {
  if (!db) throw new Error("Firestore instance is required");
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, { status });
};