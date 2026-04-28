# EncomiendaYA — Contexto del Proyecto

App de delivery local para **Tinogasta, Argentina**. Marketplace donde tiendas publican productos y repartidores hacen las entregas.

## Stack
- **Next.js 14** (App Router) — frontend + API routes
- **Firebase** (Firestore + Auth + FCM) — base de datos, autenticación, notificaciones push
- **Firebase Admin SDK** — usado en las API routes del servidor
- **MercadoPago** — pasarela de pago (preferencias + webhook)
- **Vercel** — deploy en https://encomienda-ya-app.vercel.app
- **Tailwind CSS + shadcn/ui** — estilos y componentes
- **Leaflet + react-leaflet** — mapas de tracking en tiempo real

## Roles de usuario
- `buyer` — cliente que hace pedidos
- `store` — dueño de tienda
- `delivery` — repartidor
- `admin` — administrador de la plataforma

## Flujo de pedido completo
1. Cliente arma carrito (`/cart`) → un solo `storeId` a la vez, persiste en localStorage
2. Checkout → `POST /api/orders/create` — API segura: recalcula precios en servidor, idempotencia por `idempotencyKey`, notifica tienda por FCM
3. Tienda confirma stock → cambia estado a `Pendiente de Pago`
4. Cliente paga → `POST /api/checkout` → genera preferencia MercadoPago → redirige al cliente
5. MercadoPago llama `POST /api/webhooks/mercadopago` → verifica firma HMAC → actualiza orden a `En preparación` → notifica tienda y cliente por FCM
6. Repartidor toma pedido desde `/delivery/dashboard`
7. Repartidor confirma entrega → estado `Entregado`

## Estados de la orden (en orden)
```
Pendiente de Confirmación → Pendiente de Pago → En preparación → Listo para recoger → En camino → En reparto → Entregado
```
También: `Cancelado`, `Rechazado`

## Archivos clave
- `src/lib/order-service.ts` — tipos Order/OrderStatus, createOrder, updateOrderStatus, sendNotification
- `src/lib/data-service.ts` — getStoreById, CRUD productos, updateStoreStatus, updateDeliveryPersonnelStatus
- `src/lib/user-service.ts` — CRUD perfil de usuario, addresses, createStoreForUser
- `src/lib/firebase-admin.ts` — inicialización Admin SDK (adminDb, adminMessaging)
- `src/context/auth-context.tsx` — AuthProvider, useAuth, registro FCM token
- `src/context/cart-context.tsx` — CartProvider, useCart, localStorage
- `src/app/api/orders/create/route.ts` — creación segura de órdenes
- `src/app/api/checkout/route.ts` — generación de preferencia MercadoPago
- `src/app/api/webhooks/mercadopago/route.ts` — webhook con verificación HMAC
- `src/app/api/orders/confirm-payment/route.ts` — confirmación manual de pago
- `src/app/delivery/dashboard/page.tsx` — panel repartidor (disponibles / en curso / billetera)
- `src/app/orders/[orderId]/order-status-updater.tsx` — controles de cambio de estado por rol
- `src/app/orders/[orderId]/order-map.tsx` — mapa en tiempo real con Leaflet

## Costos configurados
- Envío fijo: **$2000 ARS**
- Service fee: **5%** del subtotal (configurable en Firestore `config/platform.serviceFee`)

## Variables de entorno necesarias
```
# MercadoPago
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=

# Firebase Admin (servidor)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Firebase Cliente (público)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=

# App
NEXT_PUBLIC_BASE_URL=https://encomienda-ya-app.vercel.app
```
El archivo `.env.local` con los valores reales NO va a git. Hay que copiarlo manualmente en cada PC.

## Detalles importantes
- **Idempotencia de pedidos:** la API genera un `idempotencyKey` por intento de checkout para evitar pedidos duplicados por doble click
- **Verificación de precios:** el servidor recalcula todos los precios desde Firestore — el cliente nunca define precios finales
- **Webhook MercadoPago:** verifica firma HMAC con `MP_WEBHOOK_SECRET`. Si no está configurado en dev, omite la verificación con warning
- **FCM Tokens:** se guardan en `users/{uid}.fcmToken` (string) y `fcmTokens` (array) para soporte multi-dispositivo
- **Estructura de productos:** los productos pueden estar en `stores/{id}/products` o `stores/{id}/items` (compatibilidad legacy)
- **Pago en efectivo:** el repartidor ve una alerta especial en el dashboard y debe cobrar `order.total` al entregar

## Git workflow
```bash
# Al terminar de trabajar (en cualquier lugar)
git add .
git commit -m "descripción"
git push

# Al llegar al otro lugar
git pull
```
Remote: `https://github.com/forthemoney9595-beep/encomienda-ya-app.git`
