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

export type PaymentMethod = 'CARD';

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
  paymentMethod: PaymentMethod;
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

  // ✅ NUEVOS CAMPOS FINANCIEROS (SEPARADOS)
  // Permiten saber si ya le pagaste a la tienda y al repartidor por separado.
  storePayoutStatus?: 'pending' | 'paid'; 
  deliveryPayoutStatus?: 'pending' | 'paid'; 
  
  payoutDate?: any; 
}

export interface CreateOrderInput {
  userId: string;
  customerName: string;
  customerPhoneNumber: string; 
  storeId: string;
  storeName: string;
  storeAddress: string;
  items: any[];
  shippingInfo: { name: string; address: string; };
  subtotal: number; 
  deliveryFee: number; 
  serviceFee?: number; 
  total: number; 
  customerCoords?: { latitude: number; longitude: number };
}

const PLATFORM_FEE_PERCENTAGE = 0.05; 
const DEFAULT_DELIVERY_FEE = 2000; 

export const OrderService = {
    // Calculadora visual para el carrito (Cliente)
    calculateTotals: (subtotal: number) => {
        const serviceFee = Math.round(subtotal * PLATFORM_FEE_PERCENTAGE);
        const deliveryFee = DEFAULT_DELIVERY_FEE;
        const total = subtotal + serviceFee + deliveryFee;
        return { subtotal, serviceFee, deliveryFee, total };
    },

    // Notificaciones Genéricas (Campanita)
    sendNotification: async (db: Firestore, userId: string, title: string, message: string, type: string, orderId?: string) => {
        try {
            await addDoc(collection(db, 'notifications'), {
                userId,
                title,
                message,
                type,
                orderId,
                read: false,
                createdAt: serverTimestamp(),
                icon: 'bell'
            });

            // Disparar notificación Push (opcional si tienes configurado el API route)
            fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    title,
                    body: message,
                    link: orderId ? `/orders/${orderId}` : '/orders'
                })
            }).catch(err => console.error("Error API Push:", err));

        } catch (error) {
            console.error("Error enviando notificación:", error);
        }
    }
};

// Crea la orden llamando a la API Segura
export const createOrder = async (db: Firestore, input: CreateOrderInput) => {
  console.log("🚀 Enviando pedido a API Segura...");

  try {
      const response = await fetch('/api/orders/create', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              userId: input.userId,
              items: input.items,
              shippingInfo: input.shippingInfo,
              storeId: input.storeId,
              paymentMethod: 'CARD', 
              customerCoords: input.customerCoords 
          }),
      });

      const data = await response.json();

      if (!response.ok) {
          throw new Error(data.error || 'Error al procesar el pedido en el servidor.');
      }

      console.log("✅ Pedido creado vía API:", data.orderId);

      return { 
          id: data.orderId, 
          total: data.total, 
          status: 'Pendiente de Confirmación',
          ...input 
      };

  } catch (error) {
      console.error("❌ Error creando orden:", error);
      throw error;
  }
};

export const updateOrderStatus = async (db: Firestore, orderId: string, status: OrderStatus) => {
  if (!db) throw new Error("Firestore instance is required");
  
  const orderRef = doc(db, 'orders', orderId);
  
  await updateDoc(orderRef, { status });

  try {
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          const userId = orderData.userId;
          const storeName = orderData.storeName || "La Tienda";

          let title = "";
          let message = "";

          switch (status) {
              case 'Pendiente de Pago':
                  title = "✅ ¡Pedido Aceptado!";
                  message = `${storeName} confirmó stock. Entra para pagar.`;
                  break;
              case 'En preparación':
                  title = "👨‍🍳 Cocinando";
                  message = `${storeName} está preparando tu pedido.`;
                  break;
              case 'En reparto':
                  title = "🛵 ¡En Camino!";
                  message = "El repartidor está yendo a tu domicilio.";
                  break;
              case 'Entregado':
                  title = "🏠 ¡Llegamos!";
                  message = "Disfruta tu pedido. No olvides calificar.";
                  break;
              case 'Rechazado':
                  title = "❌ Pedido Rechazado";
                  message = `${storeName} no puede tomar tu pedido ahora.`;
                  break;
              case 'Cancelado':
                  title = "🚫 Pedido Cancelado";
                  message = "El pedido ha sido cancelado.";
                  break;
          }

          if (title && userId) {
              await OrderService.sendNotification(
                  db,
                  userId,
                  title,
                  message,
                  "order_status",
                  orderId
              );
          }
      }
  } catch (error) {
      console.error("Error notificación cliente:", error);
  }
};