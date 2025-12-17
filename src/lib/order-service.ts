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
  subtotal: number; // Solo referencial, la API recalcula
  deliveryFee: number; // Solo referencial
  serviceFee?: number; // Solo referencial
  total: number; // Solo referencial
  // ✅ Nuevo: Pasamos coordenadas si existen
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
    // ✅ Esto es SEGURO porque tus reglas permiten 'create' en 'notifications'
    sendNotification: async (db: Firestore, userId: string, title: string, message: string, type: string, orderId?: string) => {
        try {
            // 1. Guardar notificación interna
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

            // 2. Disparar notificación Push
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

// 🚨 REFACTORIZADO: Ahora llama a la API Segura
export const createOrder = async (db: Firestore, input: CreateOrderInput) => {
  // Nota: 'db' ya no se usa aquí, pero lo dejamos para no romper compatibilidad con quien llame a la función
  
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
              paymentMethod: 'CARD', // Forzado
              customerCoords: input.customerCoords // Pasamos GPS si existe
          }),
      });

      const data = await response.json();

      if (!response.ok) {
          throw new Error(data.error || 'Error al procesar el pedido en el servidor.');
      }

      console.log("✅ Pedido creado vía API:", data.orderId);

      // Devolvemos un objeto similar al esperado por el frontend para que no rompa
      return { 
          id: data.orderId, 
          total: data.total, 
          status: 'Pendiente de Confirmación',
          // Rellenamos el resto con lo que envió el cliente para que la UI actualice rápido
          ...input 
      };

  } catch (error) {
      console.error("❌ Error creando orden:", error);
      throw error;
  }
};

// ✅ Esta función se mantiene igual porque tus reglas permiten UPDATE bajo ciertas condiciones
export const updateOrderStatus = async (db: Firestore, orderId: string, status: OrderStatus) => {
  if (!db) throw new Error("Firestore instance is required");
  
  const orderRef = doc(db, 'orders', orderId);
  
  // 1. Actualizamos el estado
  await updateDoc(orderRef, { status });

  // 2. Notificamos al Cliente (Solo Push/Campana, no lógica de negocio)
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