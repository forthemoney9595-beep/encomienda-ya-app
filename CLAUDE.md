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
2. Checkout → `POST /api/orders/create` — API segura: recalcula precios en servidor (incluyendo `discountPercent` si el producto tiene), valida y descuenta `stock` (transacción, evita sobreventa), idempotencia por `idempotencyKey`, notifica tienda por FCM
3. Tienda confirma stock → `POST /api/orders/confirm-stock` (puede sacar ítems puntuales sin stock en vez de todo-o-nada; recalcula el total server-side) → estado `Pendiente de Pago`
4. Cliente paga → `POST /api/checkout` → genera preferencia MercadoPago → redirige al cliente
5. MercadoPago llama `POST /api/webhooks/mercadopago` → valida el pago (re-consulta a la API de MP) → actualiza orden a `En preparación` → notifica tienda y cliente por FCM
6. Tienda marca `Listo para recoger` → `POST /api/orders/notify-drivers` avisa a TODOS los repartidores
7. Repartidor toma el pedido desde `/orders` (panel de entregas) → `En camino` → marca "ya retiré" → `En reparto`
8. Repartidor confirma entrega → estado `Entregado` → el comprador puede calificar la tienda (`POST /api/reviews/create`) y al repartidor

## Estados de la orden (en orden)
```
Pendiente de Confirmación → Pendiente de Pago → En preparación → Listo para recoger → En camino → En reparto → Entregado
```
También: `Cancelado`, `Rechazado`

## Archivos clave
- `src/lib/order-service.ts` — tipos Order/OrderStatus, updateOrderStatus (notifica al cliente en cada estado), sendNotification
- `src/lib/order-status.ts` — helper compartido: estado → color semántico (badges/iconos) para cliente/tienda/repartidor
- `src/lib/user-service.ts` — CRUD perfil de usuario, addresses, createStoreForUser
- `src/lib/firebase-admin.ts` — inicialización Admin SDK (adminDb, adminMessaging)
- `src/context/auth-context.tsx` — AuthProvider, useAuth, registro FCM token
- `src/context/cart-context.tsx` — CartProvider, useCart, localStorage
- `src/app/app-content.tsx` — shell: Sidebar (PC) + BottomNav (celular) + header
- `src/components/bottom-nav.tsx` — barra inferior móvil (por ahora solo rol buyer)
- `src/app/api/orders/create/route.ts` — creación segura de órdenes (verifica precios contra Firestore)
- `src/app/api/checkout/route.ts` — preferencia MercadoPago (toma items+envío+serviceFee de la orden ya creada)
- `src/app/api/webhooks/mercadopago/route.ts` — webhook (ver caveat de firma abajo)
- `src/app/api/orders/notify-drivers/route.ts` — avisa a todos los repartidores (Admin SDK; el cliente no puede listar users)
- `src/app/api/orders/confirm-payment/route.ts` — confirmación manual de pago
- `src/app/api/orders/confirm-stock/route.ts` — la tienda confirma un pedido (puede sacar ítems puntuales); recalcula subtotal/serviceFee/total siempre server-side
- `src/app/api/reviews/create/route.ts` — reseña de tienda (Admin SDK): verifica pedido `Entregado` del comprador, evita duplicados (`order.storeReviewed`), actualiza `stores/{id}.rating` con una transacción (`ratingSum`/`ratingCount`), notifica al dueño
- `src/app/orders/delivery-orders-view.tsx` — panel real del repartidor (disponibles / en curso / billetera) en `/orders`
- `src/app/orders/store-orders-view.tsx` — panel de la tienda (`/orders`): pestaña "Nuevos" con checkboxes por ítem para confirmar con cambios, alerta sonora (Web Audio API) cuando entra un pedido
- `src/app/orders/[orderId]/page.tsx` — detalle/seguimiento del pedido (también tiene acciones de repartidor y el botón "Calificar tienda")
- `src/app/orders/[orderId]/order-status-updater.tsx` — controles de cambio de estado por rol (incluye los mismos checkboxes de stock que store-orders-view)
- `src/app/orders/[orderId]/order-map.tsx` — mapa en tiempo real con Leaflet
- `src/app/my-store/reviews/page.tsx` — reseñas de la tienda + respuesta opcional del dueño
- `src/lib/category-style.ts` — ícono+color por categoría (chips de Inicio y de cada tienda)
- `src/app/error.tsx` / `src/app/not-found.tsx` — páginas de error y 404 globales
- `firestore.indexes.json` — índices compuestos (incluye notifications userId+createdAt, reviews storeId+createdAt); refleja lo desplegado

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
- **Idempotencia de pedidos:** tanto `/checkout` como el diálogo rápido (`checkout-dialog.tsx`) mandan un `idempotencyKey` a `/api/orders/create` para evitar pedidos duplicados por doble click
- **Verificación de precios:** `/api/orders/create` Y `/api/checkout` buscan el precio real en Firestore (`stores/{id}/products` o `/items`); el cliente nunca define precios. La preferencia de MP cobra `subtotal + envío + serviceFee` (= `order.total`)
- **Webhook MercadoPago — CAVEAT:** hay una inconsistencia de MercadoPago: la firma HMAC nunca valida aunque el `MP_WEBHOOK_SECRET` coincida byte a byte (panel vs. servicio de firmas). Por eso la verificación de firma está **bajada a warning** (no rechaza); la validación real es re-consultar el pago a la API de MP y solo procesar si está `approved`. **TODO antes de lanzar:** revisar con MP (puede requerir app/credenciales nuevas) y volver a exigir firma válida. Tiene rate-limit 60/min
- **FCM Tokens:** se guardan en `users/{uid}.fcmToken` (string) y `fcmTokens` (array) para soporte multi-dispositivo
- **Notificaciones (campanita):** la consulta DEBE llevar `orderBy('createdAt','desc')` + el índice compuesto; sin orderBy, Firestore ordena por ID aleatorio y con +20 notifs las nuevas aparecen/desaparecen al azar
- **Estructura de productos:** los productos pueden estar en `stores/{id}/products` o `stores/{id}/items` (compatibilidad legacy). El panel de productos y la tienda pública leen AMBAS subcolecciones
- **Notificar repartidores:** la tienda no puede listar `users` (reglas), así que el broadcast va por `/api/orders/notify-drivers` (Admin SDK)
- **Roles admin:** el rol real lo decide `roles_admin/{uid}` (lo que exige firestore.rules), no `users.role`. Al promover/degradar admin desde el panel hay que sincronizar ambos
- **Pago en efectivo:** el repartidor ve una alerta especial y debe cobrar `order.total` al entregar
- **Stock por producto:** `stores/{id}/items/{id}.stock` es **opcional** — sin valor = sin límite (no rompe productos viejos). Si está definido, `/api/orders/create` lo valida y descuenta dentro de una `runTransaction` junto con la verificación de precio, para que dos compradores no se lleven el último a la vez
- **Descuento por producto:** `discountPercent` (0-90) opcional; se aplica al precio real dentro de la misma transacción de `/api/orders/create`. El carrito muestra el precio YA descontado (se calcula al agregar, en `stores/[storeId]/page.tsx`), por eso `checkout-dialog.tsx`/`checkout/page.tsx` no necesitan saber nada de descuentos — el servidor es la única fuente de verdad real
- **Pausa manual de tienda:** `stores/{id}.manuallyPaused` (switch en `/my-store`, instantáneo) — además del horario, ahora hay un corte manual; `/api/orders/create` lo rechaza con 400
- **Reseñas de tienda:** `stores/{id}.rating` dejó de ser un número fijo seteado al crear la tienda — ahora es un promedio real (`ratingSum`/`ratingCount`) actualizado por `/api/reviews/create` cada vez que un comprador califica un pedido `Entregado`
- **Auth de las API routes:** ninguna ruta verifica el ID token de Firebase — confían en el `userId`/`storeId` que manda el body (igual que el resto del proyecto). Conocido, no es prioridad de esta fase, pero amerita revisión antes de un lanzamiento más serio

## Diseño / UI
- **Tema oscuro único** (`<html className="dark">`, no hay toggle). Marca **violeta** (`--primary 258 90% 66%` ≈ #8B5CF6)
- **Colores semánticos** (tokens en `globals.css` + `tailwind.config.ts`): `success`/`info`/`warning`/`destructive` con su `-foreground`. Regla: naranja/violeta = marca/CTA; verde=éxito/dinero; azul=info/en tránsito; amarillo=aviso/rating; rojo=error. Para paneles suaves usar opacidad del token (`bg-success/10`, etc.), NO los `*-50/*-100` de Tailwind (se ven lavados en oscuro)
- **Tarjetas elevadas:** `--card` es más claro que `--background` para que se despeguen; `--radius: 1rem`; `<Card>` trae sombra suave por defecto
- **Navegación:** PC = sidebar (`main-nav.tsx`); celular = bottom nav (`bottom-nav.tsx`, solo buyer por ahora). Tienda/repartidor/admin en celular siguen con el Sheet lateral
- **OJO Tailwind:** ignora clases inexistentes en silencio (`bg-sucess` no pinta nada) → verificar SIEMPRE visual, no solo el build
- **Rediseño en fases:** cliente, tienda, repartidor y admin ✅ hechos (mismos tokens). También Fase F: tienda/producto reestructurados (banner en vez de logo circular, chips de categoría con scroll-to-section, productos agrupados por categoría en filas en vez de una grilla plana, control de cantidad compartido). Pendiente: Fase J — variantes/modificadores de producto (tamaño, extras), queda anotada aparte por el alcance (toca producto+carrito+checkout a la vez)

## Pendientes pre-lanzamiento
- Revisar/resolver la firma del webhook de MP (ver caveat) y volver a exigirla
- Regenerar el `MP_WEBHOOK_SECRET` (quedó expuesto durante pruebas)
- Sacar la tabla de cuentas demo visible en `/login` (sirve para pruebas, no para producción)
- Limpiar datos de prueba (órdenes/notificaciones) antes de abrir a usuarios reales

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
