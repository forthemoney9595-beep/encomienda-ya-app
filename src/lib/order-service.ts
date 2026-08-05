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
import type { User } from 'firebase/auth';

export type PaymentMethod = 'CARD' | 'Efectivo' | 'mercadopago'; // ✅ Agregado para soportar tus métodos reales

// ✅ DICCIONARIO COMPLETO DE ESTADOS
// Aquí unificamos todos los estados que usan Admin, Tienda y Delivery
export type OrderStatus = 
  | 'pending'
  | 'Pendiente'
  | 'Pendiente de Confirmación'
  | 'Pendiente de Pago'
  | 'Aceptado'             // Tienda aceptó
  | 'En preparación'       // Cocinando
  | 'Listo para recoger'   // Esperando Delivery
  | 'En camino'            // Delivery yendo a buscarlo
  | 'En reparto'           // Delivery yendo al cliente
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
  storeOwnerId?: string | null;
  storeName: string;
  storeAddress?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  paymentMethod: string; // Lo relajamos a string para evitar conflictos con variantes
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
  deliveryReviewed?: boolean;
  storeReviewed?: boolean;
  hasReportedProblem?: boolean;

  // Reembolso registrado por /api/admin/refund-order. Se descuenta del saldo de la tienda
  // y del repartidor (ver payout-service.ts) -- antes existían en Firestore pero no en
  // este tipo, así que las billeteras los ignoraban y pagaban el pedido completo igual.
  refunded?: boolean;
  refundAmount?: number;

  // Datos del driver para el mapa en tiempo real
  driverCoords?: { latitude: number; longitude: number };
}

export const OrderService = {
    // Notificaciones Genéricas (Campanita)
    // callerUser es quien DISPARA la notificación (la tienda avisando al repartidor, etc.),
    // no el destinatario -- /api/notify ahora exige un token válido (de cualquier usuario
    // logueado) para mandar el push. Si no se pasa, el push no sale pero la notificación
    // en la campanita (el addDoc de abajo) se crea igual.
    sendNotification: async (db: Firestore, userId: string, title: string, message: string, type: string, orderId?: string, callerUser?: User | null) => {
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

            // Disparar notificación Push (opcional)
            const token = callerUser ? await callerUser.getIdToken() : null;
            fetch('/api/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
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

// ✅ GESTIÓN CENTRALIZADA DE ESTADOS Y NOTIFICACIONES
export const updateOrderStatus = async (db: Firestore, orderId: string, status: OrderStatus, callerUser?: User | null) => {
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
              case 'Listo para recoger':
                   // Opcional: Avisar al cliente que ya casi sale
                   // title = "🥡 Pedido Listo";
                   // message = "Esperando que el repartidor lo retire.";
                   break;
              case 'En camino': // ✅ NUEVO: Cuando el delivery toma el viaje
                  title = "🛵 Repartidor Asignado";
                  message = "Un repartidor está yendo a retirar tu pedido.";
                  break;
              case 'En reparto':
                  title = "🚀 ¡En Camino a tu casa!";
                  message = "El repartidor ya tiene tu pedido y va hacia ti.";
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
                  orderId,
                  callerUser
              );
          }
      }
  } catch (error) {
      console.error("Error notificación cliente:", error);
  }
};