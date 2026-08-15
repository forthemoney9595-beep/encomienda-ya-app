import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  deleteField,
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

  // Calificación de productos por el comprador: mapa {itemId: rating}. Está fuera de
  // `items` a propósito -- ver el comentario en orders/[orderId]/page.tsx: permitir que el
  // comprador reescribiera `items` para calificar le dejaba cambiar también los precios.
  itemRatings?: Record<string, number>;

  // Reembolso registrado por /api/admin/refund-order. Se descuenta del saldo de la tienda
  // y del repartidor (ver payout-service.ts) -- antes existían en Firestore pero no en
  // este tipo, así que las billeteras los ignoraban y pagaban el pedido completo igual.
  refunded?: boolean;
  refundAmount?: number;
  refundReason?: string;
  refundedAt?: Timestamp | Date;

  // Reclamo del comprador (Fase NN) -- lo escribe /api/claims/create (Admin SDK).
  // Un solo reclamo por pedido: claimId apunta al doc en `claims`.
  hasClaim?: boolean;
  claimId?: string;

  // Timestamps del ciclo de entrega. deliveredAt es la base de la ventana de reclamo
  // (claimWindowHours) -- lo escriben los 3 caminos que marcan 'Entregado' (ver
  // updateOrderStatus abajo y delivery-orders-view.tsx).
  takenAt?: Timestamp | Date | null;
  pickedUpAt?: Timestamp | Date;
  deliveredAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;

  // Datos del driver para el mapa en tiempo real. lastUpdate (ISO) alimenta el
  // indicador de "señal en vivo / señal perdida" del comprador (Fase RR). El campo se
  // BORRA al marcar 'Entregado' — la última posición del repartidor no tiene por qué
  // quedar guardada en la orden para siempre.
  driverCoords?: { latitude: number; longitude: number; lastUpdate?: string };
}

// Tope de pedidos simultáneos por repartidor (Fase DD). Compartido para que los DOS
// caminos de "tomar pedido" (panel de entregas y detalle del pedido) apliquen el mismo
// límite — en la Fase PP se encontró que el detalle no validaba nada y lo salteaba.
export const MAX_ACTIVE_ORDERS = 3;

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
                // Tanda B: el servidor (notify-server.ts) escribe `body` y este camino
                // escribía solo `message` — dos esquemas para el mismo documento, y la
                // campanita adivinaba con `notif.body || notif.message`. Se escriben los
                // dos hasta unificar los lectores.
                body: message,
                type,
                // Nunca `orderId: undefined` suelto: el SDK de Firestore lanza con valores
                // undefined y la notificación entera se perdería en silencio (bug latente
                // encontrado en la Fase PP — hasta ahora todos los call sites lo pasaban).
                ...(orderId ? { orderId } : {}),
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
            }).then(res => {
                // Un 401/500 es una respuesta "exitosa" para fetch: sin este chequeo el
                // push se perdía sin dejar rastro (solo el .catch de fallos de red).
                if (!res.ok) console.error(`[notify] push rechazado (${res.status}) para ${userId}`);
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

  // deliveredAt: la ventana de reclamo del comprador se cuenta desde acá. Antes solo lo
  // escribía delivery-orders-view.tsx (1 de los 3 caminos que marcan 'Entregado'), así que
  // había pedidos Entregado sin fecha de entrega confiable. La regla del repartidor
  // asignado en firestore.rules ya permite 'deliveredAt' junto con 'status'.
  // driverCoords se BORRA al entregar (Fase RR): antes la última posición del repartidor
  // quedaba persistida en la orden para siempre, legible por comprador/tienda/admin.
  await updateDoc(orderRef, status === 'Entregado'
    ? { status, deliveredAt: serverTimestamp(), driverCoords: deleteField() }
    : { status });

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
                  // Fase PP: este case estaba COMENTADO — la transición era muda para el
                  // comprador (y es un hito que le importa: su pedido ya está armado).
                  title = "🥡 ¡Tu pedido está listo!";
                  message = `${storeName} ya lo tiene preparado. Buscando un repartidor para llevártelo.`;
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