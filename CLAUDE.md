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
- `src/app/api/delivery-reviews/create/route.ts` — reseña de repartidor (Fase S), mismo criterio que la de tienda: colección `deliveryReviews`, actualiza `users/{driverId}.rating`; la lee el propio repartidor en `/delivery/reviews`
- `src/app/orders/delivery-orders-view.tsx` — panel real del repartidor (disponibles / en curso / billetera) en `/orders`
- `src/app/orders/store-orders-view.tsx` — panel de la tienda (`/orders`): pestaña "Nuevos" con checkboxes por ítem para confirmar con cambios, alerta sonora (Web Audio API) cuando entra un pedido
- `src/app/orders/[orderId]/page.tsx` — detalle/seguimiento del pedido (también tiene acciones de repartidor y el botón "Calificar tienda")
- `src/app/orders/[orderId]/order-status-updater.tsx` — controles de cambio de estado por rol (incluye los mismos checkboxes de stock que store-orders-view)
- `src/app/orders/[orderId]/order-map.tsx` — mapa en tiempo real con Leaflet
- `src/app/orders/delivery-orders-view.tsx` — panel operativo del repartidor (`/orders`): pestañas Disponibles/En Curso, tomar/retirar/entregar, "No puedo con este pedido"/"Reportar problema" (Fase T), toggle de disponibilidad (Fase U)
- `src/app/delivery/page.tsx` — dashboard de repartidor (resumen: disponibles/en curso/entregados hoy/ganancias, rating, accesos). Fase U
- `src/app/delivery/analytics/page.tsx` — analíticas del repartidor (ganancias por día, horas pico, movimientos). Fase U
- `src/app/delivery/reviews/page.tsx` — reseñas del repartidor (equivalente a `/my-store/reviews`). Fase S
- `src/app/api/delivery-reviews/create/route.ts` / `src/app/api/orders/{release,report-problem}/route.ts` — APIs seguras del flujo de repartidor (Fases S/T)
- `src/components/delivery-online-toggle.tsx` — switch de `users/{uid}.isOnline`, compartido entre `/orders` y `/delivery`
- `src/lib/analytics-period.ts` / `src/components/pct-badge.tsx` — lógica de período/comparación compartida entre `my-store/analytics` y `delivery/analytics` (Fase U)
- `src/lib/firebase-aggregate.ts` — `useAggregate`/`useCountFromServer`: aggregation queries de Firestore (sum/count server-side, one-shot, con `refreshOnFocus`). Reemplazan el patrón caro de bajar la colección entera y sumar/contar en el cliente. Usado por el panel admin (Fase Z)
- `src/app/my-store/reviews/page.tsx` — reseñas de la tienda + respuesta opcional del dueño
- `src/app/my-store/page.tsx` — dashboard de tienda (resumen: métricas, alertas, rating, accesos). El form de edición está en `src/app/my-store/edit/page.tsx` (Fase P)
- `src/app/my-store/categories/page.tsx` — administra `stores/{id}.productCategories` (feed del selector de categoría del form de productos)
- `src/lib/store-hours.ts` — helper compartido de horarios (¿abierta?, por día + franjas + cerrado); lo usan tienda pública, dashboard, admin y `/api/orders/create` (Fase P)
- `src/app/stores/[storeId]/page.tsx` — tienda pública (lo que ve el comprador): info card con rating clickeable a reseñas, buscador, carrusel de destacados, menú agrupado por categoría, reseñas públicas, barra de carrito flotante (Fase Q)
- `src/components/star-rating.tsx` — estrellas de rating compartidas (tienda pública + `/my-store/reviews`)
- `src/app/admin/page.tsx` — dashboard admin unificado (estado en vivo, alertas, aprobaciones, métricas, analíticas). `/admin/dashboard` redirige acá
- `src/app/admin/pending-list.tsx` — componente de solicitudes de aprobación (tiendas/repartidores), con modal que muestra licencia/vehículo
- `src/app/admin/{orders,finances,communications,settings,reviews,audit-log}/page.tsx` — secciones del admin (ver Fase N)
- `src/app/admin/dashboard/finance-view.tsx` — tabla de retiros (métricas + filtros + aprobar/rechazar); usada en `/admin/finances`
- `src/app/admin/{stores/[storeId],delivery/[driverId]}/page.tsx` — detalle de tienda/repartidor (métricas, CBU, reseñas, pedidos, acciones)
- `src/lib/payout-service.ts` — `computeStoreBalance`/`computeDriverBalance` (saldo real, server-side)
- `src/lib/admin-audit.ts` — `logAdminAction` → colección `admin_audit_log`
- `src/lib/csv-export.ts` — descarga CSV client-side (retiros, pedidos, tiendas)
- `src/app/api/admin/{approve-withdrawal,delete-user,delete-review,notify-broadcast,refund-order}/route.ts` — rutas admin-only (verifican token + `roles_admin`)
- `src/app/api/cron/generate-settlements/route.ts` — cron de liquidación semi-automática (Vercel, protegido por `CRON_SECRET`)
- `src/lib/category-style.ts` — ícono + color + degradé por RUBRO (chips de Inicio, de cada tienda, sidebar y placeholders). OJO: define nombres de clase, por eso `src/lib` está en el `content` de `tailwind.config.ts` (Fase AA)
- `src/components/store-image.tsx` — imagen de tienda con fallback de degradé por rubro + iniciales (Fase AA)
- `src/components/store-card.tsx` — tarjeta de tienda compartida (variantes grid/carousel, fila en celular)
- `src/components/breadcrumbs.tsx` — volver + migas de pan (visible también en escritorio)
- `src/components/global-search.tsx` — buscador global ⌘K (tiendas + rubros + accesos; carga perezosa con getDocs)
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

# Sentry (monitoreo de errores, Fase CC)
NEXT_PUBLIC_SENTRY_DSN=
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
- **OJO Tailwind:** ignora clases inexistentes en silencio (`bg-sucess` no pinta nada) → verificar SIEMPRE visual, no solo el build. Dos formas de que pase, ambas ya mordieron: (a) clase mal escrita o inexistente (`h-4.5`); (b) archivo fuera del `content` de `tailwind.config.ts`, o clase armada por concatenación (`` `from-cat-${key}` ``) — el JIT escanea texto, no evalúa
- **Colores de RUBRO** (`--cat-*` en globals.css + `category-style.ts`): escala separada de los semánticos a propósito. No usar `success`/`destructive` como color de categoría: pisan el significado (verde=dinero, rojo=error) en toda la app
- **Rediseño en fases:** cliente, tienda, repartidor y admin ✅ hechos (mismos tokens). También Fase F: tienda/producto reestructurados (banner en vez de logo circular, chips de categoría con scroll-to-section, productos agrupados por categoría en filas en vez de una grilla plana, control de cantidad compartido). Pendiente: Fase J — variantes/modificadores de producto (tamaño, extras), queda anotada aparte por el alcance (toca producto+carrito+checkout a la vez)
- **Bug corregido (jul 2026) — overflow horizontal por carrusel de destacados:** cualquier
  carrusel horizontal (`components/ui/carousel.tsx`, usado por "Recomendados" en
  `stores/[storeId]/page.tsx`) hacía que TODA la página se desplazara horizontalmente en
  mobile cuando había productos `isFeatured`. Causa raíz: `min-width: auto` (el default) en
  tres contenedores flex anidados del layout general — el `<div className="flex
  min-h-screen">` de `app-content.tsx` (ítem flex del `SidebarProvider`), el `<main>` de
  `SidebarInset` (`components/ui/sidebar.tsx`) y el `<main className="flex-1">` de
  `app-content.tsx` — ninguno se dejaba encoger por debajo del ancho mínimo del contenido del
  carrusel, aunque el carrusel en sí tenga `overflow-hidden`. Se agregó `min-w-0` a los tres.
  Podía pasar en CUALQUIER página con un carrusel u otro contenido ancho dentro del layout con
  sidebar, no solo en la tienda pública, por eso el fix fue en el shell compartido. Verificado
  con Playwright headless (viewport 430px): `scrollWidth` de `<html>` pasó de 759px a 430px.

## Seguridad — Fase K (jul 2026): 4 hallazgos graves de la auditoría pre-lanzamiento, ya resueltos
Auditoría completa (3 agentes en paralelo) encontró ~20 hallazgos; se resolvieron los 4 más
graves (riesgo de plata real o datos personales). El resto queda anotado abajo, fuera de
alcance de esta fase.
- **K1** `src/app/api/webhooks/mercadopago/route.ts`: el webhook ahora valida que
  `paymentData.transaction_amount` coincida con `order.total` (tolerancia $1) y que la orden
  siga `Pendiente de Pago` antes de marcarla pagada. Si no coincide, no se marca pagada y
  queda registrado en la colección `payment_mismatches` para revisión manual.
- **K2** `storage.rules` + `image-upload.tsx`: las fotos de licencia de repartidores eran
  legibles y sobreescribibles por cualquier usuario logueado (el path de subida no llevaba el
  uid del dueño). Ahora `ImageUpload` recibe un `ownerId` obligatorio y el path queda
  `carpeta/dueño/archivo` (afecta también `profiles/`, `store-banners/`, `products/`);
  `licenses/{uid}/**` solo lo lee/escribe ese mismo usuario o un admin.
- **K3** `firestore.rules`: la tienda y el repartidor podían escribir cualquier campo del
  pedido (total, items, paymentStatus) por un `updateDoc` directo, evitando
  `/api/orders/confirm-stock`. La regla de `orders` ahora restringe por
  `affectedKeys().hasOnly([...])` y por valor de `status` permitido, igual que ya estaba hecho
  para el comprador.

**Fuera de alcance de la Fase K** (auth por token resuelto en la Fase L, ver abajo): reglas de
Storage para `profiles`/`store-banners`/`products` sin chequeo de dueño (menor severidad que
licencias — son públicas por diseño), retiros de plata aprobados sin que el servidor recalcule
el monto realmente adeudado, ~20 CVEs de `npm audit` (3 críticas, 8 altas, mayormente en
dependencias server-side de Firebase/MercadoPago), sin protección CSRF.

## Seguridad — Fase L (jul 2026): verificación de ID token de Firebase en toda la API
Cerraba la causa raíz de varios hallazgos de la Fase K: ninguna ruta verificaba que quien
llama sea realmente quien dice ser. `src/lib/auth-server.ts` agrega `verifyAuthToken(request)`
(decodifica el header `Authorization: Bearer <token>` contra Firebase Admin Auth) y
`verifyStoreOwnership(uid, storeId)` (mismo criterio que `isStoreOwner()` en
`firestore.rules`: `stores/{id}.ownerId == uid`). Del lado cliente, `src/lib/authed-fetch.ts`
agrega el token actual a cada `fetch` POST en vez de repetirlo a mano.

Las 7 rutas que antes confiaban en `userId`/`storeId` del body ahora exigen token válido:
`/api/orders/create`, `/api/checkout` (compara contra `order.userId` leído de Firestore, no
del body), `/api/orders/cancel` (+ rate limit que no tenía), `/api/reviews/create`,
`/api/orders/confirm-stock` y `/api/orders/notify-drivers` (con `verifyStoreOwnership`),
`/api/notify` (solo exige estar logueado — el destinatario es otra persona, no quien llama; +
rate limit que tampoco tenía). `OrderService.sendNotification()` y `updateOrderStatus()`
(`src/lib/order-service.ts`) ahora aceptan un `callerUser` opcional para reenviar el token al
pegarle a `/api/notify` — si no se pasa, el push no sale pero la notificación de la campanita
(escritura directa a Firestore) se sigue creando igual.

`/api/webhooks/mercadopago` (MercadoPago llama directo, no hay token de usuario) y
`/api/dev/seed` (bloqueado por `NODE_ENV`) quedaron sin tocar a propósito.

**2 bugs encontrados al probar la Fase K — ya resueltos (jul 2026):**
- La consulta de "pedidos disponibles" del repartidor pedía 6 estados (varios muertos,
  ningún código los escribe) pero la regla de lectura de `orders` solo cubría
  `status == 'En preparación'` — Firestore rechazaba la consulta COMPLETA (no la filtraba),
  así que la pestaña Disponibles quedaba siempre vacía, y "Listo para recoger" (el estado más
  importante) nunca era visible ahí. Se acotó la consulta a `['En preparación', 'Listo para
  recoger']` y se amplió la regla para que coincida exacto — a propósito no se incluyen los
  estados previos a la confirmación de stock de la tienda.
- `orders/[orderId]/page.tsx` leía `users/{order.userId}` (perfil del comprador) sin importar
  quién mirara la página — las reglas solo dejan que cada quien lea su propio perfil, así que
  para tienda/repartidor esa lectura siempre fallaba (no rompía nada, solo ensuciaba la
  consola). Se sacó esa lectura cruzada: el nombre/teléfono del comprador ya estaban en la
  propia orden (`customerName`/`customerPhoneNumber`).

## Fase M (jul 2026): billetera y analíticas (seguridad + valor real)
Revisión de la billetera y las analíticas de tienda/repartidor (estaban armadas hace tiempo
sin tocar). Cuatro sub-fases:
- **M1 — Aprobar retiro recalcula el saldo real server-side.** Antes `finance-view.tsx`
  aprobaba con `updateDoc` directo confiando en el monto guardado. Nuevo
  `src/lib/payout-service.ts` centraliza la fórmula de saldo (`computeStoreBalance` /
  `computeDriverBalance`, antes duplicada en `my-store/wallet` y `delivery/earnings`). Nueva
  ruta admin-only `/api/admin/approve-withdrawal` (verifica token + `roles_admin`): recalcula
  el saldo real y **rechaza** si el monto pedido lo supera.
- **M2 — Analíticas de tienda con gráficos** (`my-store/analytics/page.tsx`): barras de ventas
  por día, top 5 productos, horas pico. Usa Recharts (ya instalado) + `components/ui/chart.tsx`.
- **M3 — Filtro de fecha + comparación vs período anterior** en analíticas de tienda: selector
  7d/30d/mes/todo con `where('createdAt','>=',...)`. Trae el doble del período para comparar sin
  segunda consulta; cada tarjeta muestra el % de cambio. OJO: si el período anterior tiene 0
  pedidos NO muestra % (evita el "100%" engañoso).
- **M4 — Liquidación semi-automática.** Cron de Vercel (`vercel.json`,
  `/api/cron/generate-settlements`, diario 14:00) que el día configurado en
  `config/platform.settlementDayOfWeek` (default viernes) genera solos los `withdrawals`
  (`source:'auto'`) para tiendas/repartidores con CBU guardado y saldo > 0. El CBU se guarda la
  primera vez que hacen un retiro manual (`stores/{id}.payoutCbu` / `users/{uid}.payoutCbu`).
  El admin sigue transfiriendo a mano. **Requiere `CRON_SECRET` en las env vars de Vercel.**

## Fase N (jul 2026): panel de admin completo + reestructuración
El panel de admin tenía DOS dashboards solapados y le faltaba la mayoría de las funciones
operativas. Se reestructuró y completó:
- **Reestructuración:** había `/admin` ("Panel de Administración", con lo nuevo pero sin link en
  el menú) y `/admin/dashboard` ("Panel de Control", lo que el sidebar abría). Se unificó todo en
  `/admin`; `/admin/dashboard` ahora **redirige** a `/admin`. Finanzas, Comunicaciones y
  Configuración salieron de pestañas a rutas propias. El componente de aprobaciones se extrajo a
  `src/app/admin/pending-list.tsx`.
- **Dashboard unificado** (`src/app/admin/page.tsx`): estado en tiempo real (pedidos activos por
  estado, tiendas abiertas/pausadas, repartidores activos, aprobaciones pendientes), **alertas de
  pedidos trabados** (pedidos sin movimiento según umbral por estado), solicitudes de aprobación,
  métricas, gráficos, analíticas por tienda/repartidor, historial.
- **Rutas nuevas del admin:** `/admin/orders` (gestión de pedidos: tabla paginada + filtros +
  cancelar + reembolsar + CSV), `/admin/finances` (retiros con métricas, filtros, aprobar/rechazar
  con modal, CSV), `/admin/communications` (broadcast a todos/tiendas/repartidores/un usuario vía
  `/api/admin/notify-broadcast`), `/admin/settings` (config: serviceFee, deliveryFee, día de
  liquidación, mantenimiento), `/admin/reviews` (moderar reseñas vía `/api/admin/delete-review`),
  `/admin/audit-log` (log de acciones), `/admin/stores/[storeId]` y `/admin/delivery/[driverId]`
  (detalles con métricas, CBU editable, reseñas, pedidos, pausar/aprobar).
- **Reembolsos** (`/api/admin/refund-order` + botón en `/admin/orders`): registra el reembolso en
  `refunds`, marca la orden (`refunded`/`refundAmount`), notifica al comprador. NO transfiere plata
  (el admin devuelve por MP, igual que los retiros).
- **Borrado real de usuarios** (`/api/admin/delete-user`): borra de Firebase Auth + Firestore
  (antes solo Firestore, la cuenta seguía pudiendo loguear).
- **Log de acciones admin** (`src/lib/admin-audit.ts` → colección `admin_audit_log`): registra
  aprobar/rechazar retiro, cambiar rol, eliminar usuario, eliminar reseña, reembolsar.
- **Detalle de usuario + filtro por rol** en `/admin/users`; **badges de pendientes** en el
  sidebar (`main-nav.tsx`: tiendas/repartidores sin aprobar, retiros pendientes).
- **Fee de envío configurable** (`config/platform.deliveryFee`, default 2000, leído en
  `/api/orders/create`) — antes hardcodeado.
- **Bug corregido:** el dashboard crasheaba por `order.total.toFixed()` sobre pedidos sin `total`
  (estados pre-pago). Guardado con `(order.total || 0)`.

## Fase O (jul 2026): verificación de repartidores (licencia + gate de aprobación)
- **Licencia con 3 fotos** (`profile/page.tsx`): frente (`licenseUrl`, compat), dorso
  (`licenseBackUrl`) y selfie con el carnet (`licenseSelfieUrl`). El admin las ve en grilla al
  aprobar (`pending-list.tsx`, `delivery-personnel-list.tsx`). Sigue siendo revisión manual, pero
  con más info para detectar fraude. Verificación automática vía proveedor KYC queda anotada para
  cuando haya volumen (requiere cuenta B2B paga + Ley 25.326 de datos).
- **Gate de aprobación REAL** (`firestore.rules` + `delivery-orders-view.tsx`): un repartidor
  `Pendiente` NO puede tomar pedidos. Nuevo helper `isApprovedDriver()` en las reglas (lee
  `users/{uid}.isApproved`); la regla de autoasignación de pedidos lo exige. Cliente: botón
  deshabilitado + banner "cuenta pendiente". **Verificado en vivo:** no aprobado → permission-denied,
  aprobado → OK. Antes la aprobación del admin era decorativa.

## Fase P (jul 2026): mejoras del panel de tienda
Revisión a fondo del rol/panel de tienda. Se arreglaron desincronizaciones que eran bugs
activos y se sumaron funciones operativas. Cinco bloques:
- **P1 — Sincronización (bugs).** (a) Se sacó la pestaña "Billetera" de gestión de pedidos
  (`store-orders-view.tsx`): calculaba con una fórmula muerta (`storePayoutStatus`/`payoutDate`,
  campos que ningún código escribe) y contradecía a `/my-store/wallet`. La billetera real ya
  está en el menú. (b) El `<Select>` de categoría del form de productos
  (`my-store/products/page.tsx`) ahora usa `stores/{id}.productCategories` (con fallback a los
  defaults), así la gestión de categorías dejó de ser decorativa y queda en sync con el agrupado
  por `product.category` de la tienda pública. (c) Se agregó "Categorías" al menú de tienda
  (`main-nav.tsx`) — era una página huérfana sin link. (d) `stores/{id}.category` (rubro, filtro
  del inicio) ahora es editable en `/my-store/edit`; antes se cargaba pero nunca se guardaba.
- **P2 — Dashboard de tienda.** `/my-store` pasó a ser una landing con resumen (estado + pausa
  rápida, métricas: pedidos nuevos / en curso / entregados hoy / ventas de hoy, alertas de
  pedidos pendientes y stock bajo, rating, accesos rápidos). El formulario de edición se movió
  intacto a `/my-store/edit`. **El dashboard NO recalcula el saldo** (evita re-duplicar la
  fórmula de `payout-service.ts`): muestra ventas del día y enlaza a la billetera real.
- **P3 — Horario avanzado.** Nuevo `src/lib/store-hours.ts` = fuente de verdad única de "¿está
  abierta?" (`normalizeSchedule`/`getStoreOpenStatus`/`describeSchedule`/`nowInArgentina`).
  Soporta horario **por día**, **varias franjas por día** (siesta mañana/tarde) y **días
  cerrados**. Retrocompatible con el viejo `stores/{id}.schedule` = `{open,close}` (se aplica a
  todos los días) y con "sin horario = siempre abierta". El editor por día vive en
  `/my-store/edit` y guarda `stores/{id}.weeklySchedule` (+ un espejo legacy `schedule` por si
  queda algún lector viejo). La tienda pública, el dashboard y las vistas de admin
  (`pending-list.tsx`, `stores-list.tsx`) usan el helper. **`/api/orders/create` ahora valida el
  horario server-side** (antes solo era visual en el cliente); usa `nowInArgentina()` porque
  Vercel corre en UTC.
- **P4 — Inventario + acciones masivas** (`my-store/products/page.tsx`): filtro por estado
  (todos / disponibles / agotados-no visibles / stock bajo ≤3) y selección múltiple con barra de
  acciones masivas (marcar disponible/agotado, eliminar) vía `writeBatch`, respetando si el
  producto vive en `items` o en la subcolección legacy `products`.
- **P5 bis — Perfil de tienda vs `/my-store/edit`.** `/profile` (universal, todos los roles) tenía
  una pestaña "Configuración Tienda" que escribía horario/descripción en `users/{uid}` — campos
  que nada lee (todo lo real vive en `stores/{storeId}`, editado desde `/my-store/edit`). Se
  reemplazó por un link directo a `/my-store/edit`. Además, guardar el form de tienda copiaba el
  banner a `users/{uid}.photoURL` en cada guardado (intencional en su momento: "que el avatar sea
  la tienda"), pisando silenciosamente cualquier foto personal subida en `/profile` — se sacó esa
  copia; el avatar del sidebar/admin ahora es siempre la foto personal, independiente del banner.
- **P5 — Promos a nivel tienda: DIFERIDO.** Se evaluaron 3 mecanismos (envío gratis desde $X,
  descuento de toda la tienda %, cupones con código) pero se decidió no hacerlos ahora porque
  tocan el pipeline de pago (`/api/orders/create` + `/api/checkout` + preferencia MP). Queda para
  organizarlo mejor a futuro (probablemente como fase aparte, tipo Fase J de variantes).

**Puntos de sincronización del panel de tienda (respetar al tocar tienda/repartidor/admin):**
saldos SIEMPRE vía `payout-service.ts`; "¿abierta?" SIEMPRE vía `store-hours.ts` (no reimplementar
el chequeo de horario inline); categorías de producto = `stores/{id}.productCategories` (feed del
form) + `product.category` (agrupado público); rubro de tienda = `stores/{id}.category`.

## Fase Q (jul 2026): rediseño de la tienda pública (`stores/[storeId]/page.tsx`)
Pedido explícito: "se ve muy básica". Se hizo en 4 pasos chicos y reversibles, comparando
contra Rappi/PedidosYa como en fases anteriores:
- **Q1 — Info card pulida.** El rating dejó de ser un badge suelto: ahora es un botón que
  hace scroll a una nueva sección pública de reseñas al fondo de la página (antes las
  reseñas solo las veía el dueño en `/my-store/reviews`, protegido). Nuevo
  `src/components/star-rating.tsx` (antes duplicado inline ahí). Dirección y horario pasan
  de una línea de texto suelta a tarjetas con ícono+jerarquía. Botón "Compartir" (Web Share
  API, con fallback a copiar el link al portapapeles).
- **Q2 — Buscador dentro del menú.** Filtra por nombre/descripción; recalcula destacados y
  categorías agrupadas sobre el resultado filtrado; estado vacío propio ("Sin resultados
  para...") distinto del de "la tienda no tiene productos".
- **Q3 — Carrusel de destacados.** Reemplaza la grilla estática de "Recomendados" por un
  `Carousel` (shadcn + embla, ya estaba instalado) con swipe nativo en celular y flechas en
  desktop. Las flechas reflejan `canScrollPrev`/`canScrollNext` de embla — con pocos
  destacados que ya entran en pantalla, quedan deshabilitadas en vez de parecer rotas.
- **Q4 — Barra de carrito flotante.** El Sheet del carrito (`components/cart.tsx`) vivía con
  estado local, montado una sola vez en el header (`app-content.tsx`). Para poder abrirlo
  desde la tienda pública sin duplicar el Sheet, el estado de apertura subió a
  `CartContext` (`isCartSheetOpen`/`setCartSheetOpen`). La barra solo aparece si el carrito
  activo es el de la tienda que se está mirando (misma regla de "una tienda a la vez").
- **Verificado con datos reales:** dev server local + Firestore real (no mocks). Se
  encontraron y corrigieron en el camino: falla de `chromium-cli`/Playwright en este
  entorno Windows (no headless) — la verificación visual la hizo el usuario directamente en
  el navegador; y un despiste real (4 commits sin pushear que hacían pensar que algo estaba
  roto, cuando en realidad el sitio desplegado en Vercel simplemente no tenía los cambios
  todavía).
- **Datos de prueba:** se agregaron 3 reseñas de prueba a la tienda "DonalPizza"
  (`userName` con el prefijo `Cliente de Prueba` para identificarlas fácil) — quedan
  anotadas en el pendiente de limpieza pre-lanzamiento de abajo.

## Fase R (jul 2026): panel de repartidor — 3 bugs confirmados y resueltos
Mismo tipo de revisión que Fases P/Q, esta vez sobre `delivery-orders-view.tsx`
(`/orders` para rol `delivery`) y su relación con `/admin/delivery`.
- **R1 (seguridad, el más grave) — aprobar repartidor desde el admin no lo dejaba operar
  de verdad.** De los 4 caminos para aprobar/editar un repartidor en `/admin/delivery`,
  3 escribían `status: 'Activo'` sin tocar `isApproved` (el botón "Aprobar" del modal de
  ficha, el mismo botón del menú desplegable, y el diálogo "Editar"). La regla de
  Firestore que habilita tomar pedidos (`isApprovedDriver()`, Fase O) solo lee
  `isApproved`. Resultado: el admin aprobaba, la UI decía "Activo", pero el repartidor
  seguía bloqueado (`permission-denied` silencioso al tocar "Tomar Pedido"). Solo
  `/admin/delivery/[driverId]` (el detalle individual) los mantenía sincronizados. Se
  corrigieron los 3 caminos rotos para que `isApproved` viaje siempre junto con
  `status`, y se sacó el atajo `|| status === 'Activo'` del lado del repartidor
  (`delivery-orders-view.tsx`) que ocultaba la desincronización — ahora solo confía en
  `isApproved`, el mismo campo que la regla real.
- **R2 — pestaña "Billetera" del panel operativo, otra vez con números fantasma.** Mismo
  patrón que se arregló en `store-orders-view.tsx` (Fase P): calculaba todo con
  `deliveryPayoutStatus`/`payoutDate`, campos que ningún código escribe. Contradecía a
  `/delivery/earnings` (la billetera real). Se sacó la pestaña; de paso se eliminaron
  `storePayoutStatus`/`deliveryPayoutStatus`/`payoutDate` del tipo `Order` compartido
  (`order-service.ts`) — eran esos mismos campos fantasma los que indujeron el bug dos
  veces (tienda y repartidor).
- **R3 — "Entregado" desde el flujo principal no avisaba al comprador.**
  `confirmFinishDelivery()` (el botón real que usan los repartidores día a día) hacía un
  `updateDoc` directo en vez de pasar por `OrderService.updateOrderStatus`. Las otras dos
  transiciones (tomar pedido, retirar) sí notificaban a mano en el mismo archivo; a esta
  le faltaba. El comprador nunca se enteraba de que su pedido había llegado ni se lo
  invitaba a calificar, pegándole al embudo de reseñas de la tienda (Fase G). Se agregó
  el `sendNotification` que faltaba.
- ~~Pendiente anotado: sin forma de soltar un pedido ya tomado~~ — **resuelto en la Fase T**
  (`/api/orders/release` + `/api/orders/report-problem`).

## Fase S (jul 2026): sistema de reseñas del repartidor a la par del de tienda
Análisis de "qué le falta al panel de repartidor" (post Fase R). El hallazgo principal:
calificar al repartidor era un `updateDoc` directo del comprador sobre la propia orden
(`deliveryRating`/`deliveryReview`) — sin validar `Entregado`, sin evitar duplicados, sin
ningún promedio mantenido (el admin lo recalculaba escaneando *todos* los pedidos del
repartidor cada vez que abría su ficha), y el repartidor no tenía forma de ver su propia
nota en ningún lado. Se llevó al mismo nivel que el sistema de reseñas de tienda (Fase G):
- **Nueva `/api/delivery-reviews/create`** (mismo criterio que `/api/reviews/create`):
  verifica token, que el pedido sea del comprador, `Entregado`, con repartidor asignado, y
  no calificado ya (`order.deliveryReviewed`). Escribe en la nueva colección
  `deliveryReviews` (`{driverId, orderId, userId, userName, rating, comment, createdAt}`)
  y actualiza `users/{driverId}.rating`/`ratingSum`/`ratingCount` con una transacción
  (idéntico patrón a `stores/{id}.rating`). Notifica al repartidor (campana + push). Sigue
  escribiendo `order.deliveryRating`/`deliveryReview` (ahora desde el servidor, no del
  cliente) para no romper las vistas que ya los leían.
- **`firestore.rules`:** la orden ya no acepta `deliveryRating`/`deliveryReview` como
  campos de escritura directa del comprador (solo queda `items`, para calificar
  productos). Nueva colección `deliveryReviews`: lectura solo del propio repartidor
  calificado o admin — **no es pública** como `reviews` de tienda, porque no existe un
  perfil público de repartidor donde mostrarla.
- **Nueva página `/delivery/reviews`** (equivalente a `/my-store/reviews`): el repartidor
  ve su propio promedio + la lista de reseñas. Agregada al menú.
- **`admin/delivery/[driverId]`** y la tabla de analíticas por repartidor del dashboard
  (`admin/page.tsx`) ahora leen el rating real de `users/{id}` y las reseñas de
  `deliveryReviews` en vez de recalcular escaneando pedidos cada vez — mismo criterio que
  ya usaban sus equivalentes de tienda con `stores/{id}.rating`.
- **Desplegado a producción:** `firebase deploy --only firestore:rules,firestore:indexes`
  corrido contra `studio-354048519-4bc1e` (incluye el índice compuesto nuevo
  `deliveryReviews(driverId, createdAt)`).
- ~~Quedó pendiente: dashboard, toggle online/offline, analíticas del repartidor~~ —
  **resuelto en la Fase U.**

## Fase T (jul 2026): soltar pedido antes de retirar + reportar problema después
Seguía pendiente de la Fase S: si un repartidor tomaba un pedido y no podía completarlo,
quedaba pegado a su cuenta para siempre (solo un admin interviniendo a mano en Firestore
lo destrababa). Antes de implementar se analizó el riesgo de abuso intencional:
- **"Soltar" libre y gratis permite acaparar pedidos** — tomar todos los disponibles,
  quedarse con el mejor (más cerca/mejor propina) y soltar el resto recién ahí, dejando a
  otros repartidores sin verlos mientras tanto.
- **Dejar "cancelar" directo *después* de retirar el pedido de la tienda es el riesgo
  grave** — un repartidor podría quedarse con el producto físico sin entregarlo y borrar
  el pedido del sistema para taparlo (sin rastro, y si ya estaba pagado por MercadoPago,
  la plata del cliente queda en el limbo).

Por eso se separaron dos acciones con guardas muy distintas, ninguna de las dos es una
escritura directa del cliente (ambas van por Admin SDK, sin cambios de reglas para
`orders` más allá de lo que ya había):
- **`/api/orders/release`** — solo si `status === 'En camino'` (todavía no retiró nada).
  Exige un motivo, devuelve el pedido al pool (`deliveryPersonId: null`, vuelve a "Listo
  para recoger"), re-notifica a los demás repartidores (mismo patrón que
  `notify-drivers`), y deja un registro en la nueva colección `driver_incidents`.
- **`/api/orders/report-problem`** — solo si `status === 'En reparto'` (ya retiró). A
  propósito **no cambia el estado ni libera al repartidor de la orden** — no puede
  resolverlo por su cuenta, solo escalarlo. Marca `order.hasReportedProblem` y deja el
  mismo tipo de registro en `driver_incidents` para que el admin decida (cancelar +
  reembolsar vía `/admin/orders`, reasignar, contactar al cliente).
- **`firestore.rules`:** nueva colección `driver_incidents`, lectura solo de admin.
- **UI:** botones "No puedo con este pedido" / "Reportar problema" + diálogo de motivo
  (con atajos comunes) en `delivery-orders-view.tsx`. Alerta "Incidentes recientes de
  repartidores" en el dashboard de admin, mismo estilo que la de pedidos trabados.
- **Desplegado a producción** (`firebase deploy --only firestore:rules`).

## Fase U (jul 2026): dashboard, disponible/no-disponible y analíticas del repartidor
Los últimos 3 pendientes que quedaban anotados de la revisión del panel de repartidor.
- **Disponible/no disponible:** `users/{uid}.isOnline` (sin valor = disponible, para no
  dejar de avisarle a nadie que nunca tocó el switch). Nuevo componente compartido
  `src/components/delivery-online-toggle.tsx`, visible en el panel operativo (`/orders`)
  y en el dashboard nuevo. `/api/orders/notify-drivers` y `/api/orders/release` ahora
  excluyen del broadcast a los no aprobados (ya no podían tomar el pedido igual, era el
  gap anotado en la Fase R) y a los que se marcaron no disponibles — antes avisaban a
  **todos** los `role:'delivery'` sin ningún filtro.
- **Nuevo dashboard `/delivery`** (equivalente a `/my-store`, Fase P): resumen de
  disponibles/en curso/entregados hoy/ganancias de hoy, banner de aprobación pendiente,
  rating, accesos rápidos. Agregado como "Mi Panel" en el menú.
- **Nueva `/delivery/analytics`** (equivalente a `/my-store/analytics`): ganancias
  totales, entregas completadas y ganancia promedio con comparación vs período anterior,
  gráfico de ganancias por día, horas pico, historial de movimientos. "Hoy"/el día de
  cada entrega se calcula con `deliveredAt` (no `createdAt`) — un pedido tomado un día y
  entregado al otro cuenta para el día que se entregó, no el que se creó.
- Se extrajo la lógica de período/comparación (antes duplicada palabra por palabra) a
  `src/lib/analytics-period.ts` + `src/components/pct-badge.tsx`, compartida ahora por
  `my-store/analytics` y `delivery/analytics`.
- Nuevo índice compuesto `orders(deliveryPersonId, createdAt)` que la consulta de
  analíticas del repartidor necesita — desplegado a producción junto con lo anterior.
- **Hallazgo anotado, sin resolver a propósito:** la regla de Firestore que deja a cada
  usuario editar su propio `users/{uid}` (`allow update: if isAdmin() || isOwner(userId)`)
  no restringe qué campos puede tocar — en teoría cualquier usuario logueado podría
  escribirse `isApproved: true` directo desde la consola del navegador y saltarse la
  aprobación del admin de la Fase O. Arreglarlo bien requiere inventariar todos los
  campos que cada rol legítimamente auto-edita (perfil, direcciones, vehículo, CBU, FCM,
  etc.) antes de restringir con `affectedKeys()`, para no romper nada — queda para una
  revisión dedicada aparte, no se apuró junto con esta fase.

## Fase V (jul 2026): home / listado de tiendas (lo primero que ve el cliente)
Salió de un análisis de marketplace estilo Rappi/PedidosYa pensado para Tinogasta (pueblo
chico, marketplace general, MVP sin sobreingeniería). Se atacaron los "bugs de confianza"
del listado + la fragmentación de rubros. Todo en `src/app/page.tsx` salvo el rubro:
- **Estado abierto/cerrado/pausada en cada tarjeta** — antes el listado no lo mostraba y
  el cliente podía entrar a ciegas a una tienda cerrada, aunque la lógica ya existía
  (`store-hours.ts`, Fase P). Badge verde "Abierto" / gris "Cerrado"/"Pausada" + imagen
  en gris si no opera. La pausa manual se evalúa aparte del horario (igual que la tienda
  pública). Además el listado ordena **abiertas primero** (luego favoritas, luego rating).
- **Envío real** en la tarjeta — antes decía "$2000" hardcodeado; ahora lee
  `config/platform.deliveryFee` (configurable desde `/admin/settings`, Fase N).
- **Rubro de tienda unificado (los 3 conceptos de categoría, punto de raíz):** el rubro
  `stores/{id}.category` tenía 3 fuentes distintas — alta con dropdown gastronómico,
  editor texto libre, menú "Explorar Tiendas" hardcodeado — que fragmentaban las
  categorías. Nuevo `src/lib/store-categories.ts` (`STORE_CATEGORIES`, lista canónica
  general de pueblo). El alta (`/signup/store`) y el editor (`/my-store/edit`, ahora
  Select con fallback al rubro viejo) usan esa lista; el menú "Explorar Tiendas" del
  comprador (`main-nav.tsx`) se arma con los rubros REALES de las tiendas aprobadas (no
  links fijos). Íconos nuevos en `category-style.ts` para Farmacia/Supermercado.
  Recordatorio de los 3 conceptos: `store.category` (rubro, home) ≠
  `store.productCategories` (secciones internas, `/my-store/categories`) ≠
  `product.category` (agrupa el menú público).
- **Badge de "Ofertas" en el home (Opción A, denormalizada):** en vez de leer los
  productos de cada tienda en el home (N×2 lecturas por visita, escala mal), se guarda
  `stores/{id}.maxDiscountPercent` y el home lo lee del doc que ya trae (cero lecturas
  extra). Lo mantiene `/my-store/products` con un efecto que recalcula el mayor descuento
  entre productos comprables (disponibles + con stock) y lo escribe si cambió — el panel
  de productos es el único punto donde muta el catálogo. El home muestra "Hasta -X%" si
  `maxDiscountPercent > 0`. Backfill único ya corrido (0 tiendas con descuento activo a
  la fecha; el mecanismo queda listo). Evolución futura posible: una fila "Ofertas" con
  productos reales vía `collectionGroup('items')` (más vendedor, pero otro alcance).
- **Editor de tienda reorganizado en secciones** (`/my-store/edit`): era un form largo
  único (el remanente más claro del "ABM viejo"). Ahora son 4 Cards con título/ícono
  (Datos del negocio / Ubicación / Horarios / Entrega) + barra de guardado sticky abajo.
  Se eligió **secciones y NO wizard** a propósito: el wizard ayuda al onboarding pero mete
  fricción al editar cambios chicos, que es el uso real de esta página. Mismos campos y
  handlers — reorganización visual, no lógica nueva.
- **Combos como producto (no estructurado):** se descartó el combo estructurado (tocaría
  carrito/checkout/stock/pago). En su lugar: "Combos" en las categorías por defecto de
  producto (`DEFAULT_CATEGORIES` en `my-store/products`) + un tip en el diálogo de nuevo
  producto. El comercio arma el combo como un producto normal con precio total; se agrupa
  en su propia sección del menú. Cero cambios en el pipeline de pago.
- **GPS del checkout — reusar la dirección guardada (patrón Rappi/PedidosYa).** Se
  auditó todo el flujo de geolocalización (tienda, perfil, checkout, mapa de
  seguimiento, tracking en vivo del repartidor) antes de evaluar geo-distancia. Hallazgo
  principal: `CheckoutDialog` (el checkout real — es el único alcanzable desde la app;
  `/checkout` la página completa **no tiene ningún link en toda la app**, es código
  muerto) exigía capturar el GPS de nuevo en *cada* compra, sin reusar el que el
  comprador ya tenía guardado en una dirección de `/profile`. Corregido: la dirección
  guardada con coords se pre-selecciona sola al abrir el diálogo (chips para elegir
  entre guardadas o "+ Nueva ubicación"); el botón de GPS solo aparece si hace falta
  (dirección nueva, o una guardada que todavía no tiene coords). De paso se corrigió el
  mismo bug de envío hardcodeado (`$2000`) que ya se había arreglado en el home (Fase V)
  pero que `CheckoutDialog` tenía duplicado aparte — ahora lee
  `config/platform.deliveryFee` en los dos lugares.
- **Pendiente anotado, no resuelto:** `/checkout` (página completa, distinta de
  `CheckoutDialog`) es código muerto — nada navega ahí. Tenía su propio comportamiento
  de GPS (opcional, no bloqueaba) inconsistente con `CheckoutDialog` (obligatorio). Si
  se reactiva algún día, aplicar el mismo criterio de reuso de dirección guardada.
  Tampoco se tocó el bloqueo duro de "sin GPS no se puede pedir" — sacarlo es una
  decisión de producto aparte, no técnica.
- **Diferido a v2 (del análisis, no urgente para Tinogasta):** envío gratis desde $X (toca
  pago), combo estructurado / variantes de producto (tamaño/extras, la vieja Fase J),
  cupones, mostrar distancia en km (bajo valor real en un pueblo chico, además depende
  de que tienda y comprador tengan GPS cargado, cosa que hoy es opcional en ambos
  lados). Pin ajustable a mano en el mapa al guardar una dirección (patrón "gold
  standard" de Rappi/PedidosYa — hoy solo se confía en la lectura cruda del GPS) queda
  como mejora futura de UX, no urgente. (Un wizard de *onboarding* en `/signup/store`
  quedó descartado por ahora; el alta actual es suficiente.)

## Fase X (jul 2026): registro más real — teléfono/DNI/CUIT + bug de Google
Se corrigió esta nota, que estaba desactualizada: "olvidé mi contraseña" **ya existía**
(`/forgot-password`, `sendPasswordResetEmail` de Firebase) y el botón de login con Google
**ya existía** — pero tenía un bug real, no solo faltaba hacerlo.
- **Bug de Google corregido:** cuando alguien nuevo entraba con Google,
  `auth-context.tsx` armaba un perfil "buyer" **solo en memoria**, sin escribirlo nunca en
  Firestore. Esa cuenta quedaba a medias: no podía guardar cambios en `/profile`
  (`updateDoc` falla si el documento no existe) y cualquier lectura de `users/{uid}` en
  el server podía fallar en silencio. Ahora, en el mismo lugar (`onSnapshot` sobre el
  perfil), si el documento no existe se crea de verdad con `setDoc` (rol `buyer` por
  defecto, igual que el alta normal) — corregido en el único punto central en vez de
  parchear el botón, así cubre cualquier método de login futuro que termine en un
  usuario sin perfil.
- **Comparación con Rappi/PedidosYa** (investigado antes de decidir el alcance): esas
  apps piden teléfono verificado por SMS a todos, y a repartidores DNI + fecha de
  nacimiento + patente/cédula del vehículo + a veces antecedentes penales; a tiendas
  CUIT + a veces habilitación municipal. Se decidió sumar lo que tiene costo cero (campos
  de texto) y dejar la verificación por SMS para más adelante (requiere proveedor
  externo pago tipo Twilio, no se justifica todavía para el volumen de Tinogasta).
- **`/signup/buyer`:** teléfono ahora obligatorio.
- **`/signup/delivery`:** teléfono, **DNI** (regex 7-8 dígitos) y **fecha de nacimiento**
  (con validación de mayoría de edad, ≥18 años) ahora obligatorios. De paso se agregó
  `isApproved: false` explícito (antes solo se seteaba `status: 'Pendiente'` y quedaba
  implícito — funcionaba igual porque la regla trata "no es true" como no aprobado, pero
  quedaba inconsistente con el resto del código que sí lo setea explícito).
- **`/signup/store`:** teléfono del dueño y **CUIT** del negocio (regex con o sin
  guiones) ahora obligatorios; `cuit` se guarda en `stores/{id}`.
- **Tipos actualizados:** `UserProfile` (`dni`, `birthDate`) en `auth-context.tsx`,
  `Store` (`cuit`) en `placeholder-data.ts`.
- **Pendiente, anotado para otra vuelta (no se tocó):** que el admin pueda editar
  datos/contraseña de otras cuentas; verificación real de teléfono por SMS; signup
  (no solo login) con Google.

## Fase Y (jul 2026): consultas acotadas — primer fix de escala en `main-nav.tsx`
Salió de una charla sobre cómo escalar (usuarios/tiendas/pedidos creciendo con el tiempo)
sin que Firestore/Vercel se disparen de costo. Se identificaron 3 consultas que bajan
colecciones enteras sin filtrar; se atacó la más barata y de mayor impacto primero.
- **`main-nav.tsx` — conteo de pendientes:** corría en CADA página del panel admin y bajaba
  la colección `users` ENTERA (dominada por compradores, crece sin techo) solo para dos badges.
  Ahora consulta `where('isApproved','==',false)` — solo tiendas/repartidores sin aprobar (set
  chico y acotado). Índice de un solo campo = automático, sin deploy. **Verificado contra
  Firestore real:** viejo vs nuevo dan el mismo conteo (tiendas 1/1, repartidores 2/2); la
  query bajó de 18 docs a 3.
- **`main-nav.tsx` — rubros del comprador:** ídem, ahora `where('isApproved','==',true)` en vez
  de traer todas las tiendas. La colección `stores` es acotada (pueblo chico), así que el ahorro
  es menor, pero además evita que una tienda sin aprobar aporte su rubro. Rubros idénticos antes
  y después.
- **Bug de dato del seed corregido en el camino:** 3 tiendas del seed (Fase W: `super@`,
  `farmacia@`, `kiosco@`) tenían el doc de tienda aprobado pero el doc de **usuario sin el campo
  `isApproved`** — estado que el flujo real de aprobación (`admin/page.tsx:handleUpdateUserStatus`,
  escribe el campo en AMBOS docs) nunca produce. El filtro viejo (`!u.isApproved`) las contaba mal
  como pendientes (badge decía 4, real 1); el dashboard de admin sufría lo mismo. Se seteó
  `isApproved:true` en esos 3 docs de usuario (script Admin SDK puntual, no quedó en el repo) para
  que el dato refleje un estado de producción válido; ahora badge y dashboard coinciden en 1.
- **Regla nueva a respetar:** NINGUNA consulta de cliente debe bajar una colección que crece sin
  techo (`users`, `orders`, `reviews`) sin `where`/`limit`. ~~Todavía pendiente: el dashboard de
  admin...~~ — **resuelto en la Fase Z** (abajo).

## Fase Z (jul 2026): reestructura del panel admin con aggregation queries (sin Cloud Functions)
Continuación directa de la Fase Y. El resto de las pantallas admin bajaban colecciones enteras que
crecen sin techo (dashboard/finanzas/usuarios/reseñas) porque calculaban agregados en el cliente.
Salió de una charla sobre escala: la clave fue notar que **Firebase v11 trae aggregation queries
nativas** (`getCountFromServer`, `getAggregateFromServer` con `sum`/`count`), que hacen los totales
server-side sin bajar documentos y **sin necesidad de Cloud Functions ni contadores denormalizados**.
- **Helper nuevo `src/lib/firebase-aggregate.ts`:** `useAggregate` (sum/count) y `useCountFromServer`,
  ambos one-shot (no `onSnapshot`) con `refresh()` y opción `refreshOnFocus` (recalculan al volver a
  la pestaña — así los totales se sienten "vivos" sin listener permanente).
- **Principio de diseño (respetar):** datos "en vivo" (pedidos activos ahora, set chico) = listener
  `useCollection` acotado con `where('status','in',[activos])`; totales históricos = aggregation
  (`sum`/`count`); analíticas por período = bajar solo el período (`where('createdAt','>=')`,
  acotado); listas de historial = paginar con `getDocs`+`limit`+cursor.
- **Dashboard (`admin/page.tsx`):** headline cards (Ingresos/Completados via `sum('total')`+`count()`
  sobre Entregado; Usuarios via `count` role!=admin) con botón "Refrescar" + refreshOnFocus; estado
  en vivo/alertas de trabados sobre un listener acotado a estados activos; distribución y analíticas
  sobre el período (se quitó la opción "Todo", único caso sin techo); "Historial de Pedidos" (bajaba
  TODAS) → "Pedidos Recientes" (limit 10) + link a `/admin/orders` (que ya está paginado). Constantes
  `ACTIVE_STATUSES`/`STUCK_THRESHOLDS_H` subidas a nivel de módulo.
- **`admin/finances` + `finance-view.tsx`:** bajaba `orders`+`users`+`stores` ENTERAS solo para
  pasárselas a `FinanceView`, que **no las usaba** (props muertos). Se eliminaron esas 3 queries y
  los props; `FinanceView` ya traía sus `withdrawals` solo.
- **`admin/users`:** conteos por rol via `useCountFromServer` (5 counts); tabla paginada con
  `getDocs`+cursor ("Cargar más") — NO usa `useCollection` porque el hook descarta el snapshot que
  `startAfter` necesita; búsqueda por **prefijo de email server-side**
  (`where('email','>=',t)`+`where('email','<=',t+)`, `String.fromCharCode(0xf8ff)`), no fuzzy.
- **`admin/reviews`:** paginación `getDocs`+cursor + conteo total via aggregation; la búsqueda por
  substring quedó client-side sobre las páginas ya cargadas (Firestore no hace substring server-side).
- **`admin/communications`:** el picker de "un usuario" destino bajaba TODOS los usuarios; ahora
  busca on-demand por prefijo de email (mismo patrón que `admin/users`). El broadcast a
  todos/tiendas/repartidores ya iba server-side (`/api/admin/notify-broadcast`), no toca esto.
- **Índice nuevo:** `orders (status, total)` en `firestore.indexes.json` — lo exige la aggregation
  `sum('total')` filtrada por `status`. **Desplegado a producción** (`firebase deploy --only
  firestore:indexes` contra `studio-354048519-4bc1e`). El resto (counts de un solo campo, prefijo de
  email, orderBy(documentId)) usa índices automáticos, sin deploy.
- **Verificado end-to-end** (Playwright headless + login admin real + Firestore real): los 3 totales
  del dashboard dieron idéntico al scan manual (Ingresos $29.850, Usuarios 19, Completados 6), y las
  5 pantallas renderizan sin errores de consola.
- **Cloud Functions: NO se usaron** — este enfoque las hace innecesarias para el panel. Único
  trade-off aceptado: los totales históricos se refrescan al abrir/enfocar, no tironean en vivo (los
  pedidos activos sí siguen live). `maxDiscountPercent` (badge del home) queda igual, fuera de alcance.

## Fase AA (jul 2026): rediseño visual + navegación del comprador
Pedido del usuario: "que se vea todo mucho más bonito, más colores" + mejorar la navegación de
tienda a tienda. Se auditó el código Y se miró la app corriendo (capturas reales a 430px y 1440px).

**Diagnóstico — el problema #1 no era el layout, eran las fotos faltantes:** 5 de 7 tiendas no
tienen banner, y la tarjeta mostraba un `aspect-video` gris con un ícono → el inicio era una pared
de cajas grises. Ningún rediseño luce mientras eso siga así.

- **`src/components/store-image.tsx` (nuevo, la pieza de mayor impacto):** si la tienda no tiene
  foto (o falla al cargar) pinta un **degradé del rubro + ícono + iniciales**. Cada tienda tiene
  identidad visual aunque nunca suba una imagen. El `onError` además vuelve seguro usar
  `next/image` con URLs de hosts que no están en `remotePatterns` (next.config.js).
- **Escala `--cat-*` dedicada** (globals.css) en vez de reciclar los semánticos: usar
  `destructive` para Farmacia y `success` para Supermercado (como estaba) ensuciaba el lenguaje
  de color de toda la app (verde=éxito/dinero, rojo=error). 10 matices bien separados.
- **`category-style.ts` v2 — el fix real de los colores repetidos era el ORDEN del matcher:**
  `"comida-rapida".includes('comida')` es `true`, así que lo rápido tiene que evaluarse ANTES que
  comida (ídem kiosco antes que supermercado). El fallback pasó de posición en el array a **hash
  estable**: antes el color de un rubro cambiaba según qué tiendas hubiera antes en la lista.
  Ahora expone `ring`/`solid`/`gradient` además de `bg`/`text`.
- **Inicio (`page.tsx`):** hero con degradé + globos difuminados + mini-stats, chips con contador y
  estado activo real, secciones "Con descuento"/"Tus favoritas", y **tarjeta en fila en celular**
  (`store-card.tsx` nuevo, un solo markup responsive). Se eliminó el `<Select>` de categoría, que
  duplicaba exactamente los chips. El estado de apertura se precomputa una vez en vez de
  recalcularse dentro del comparador del sort.
- **Navegación (lo pedido explícito):** `breadcrumbs.tsx` (volver + migas, visible **también en
  escritorio** — antes `PageHeader` lo restringía a móvil y la tienda pública ni lo usaba);
  carrusel **"Más de {rubro}"** al final de la tienda (consulta acotada `isApproved` + `category`
  + `limit(8)`); **buscador global ⌘K** (`global-search.tsx`); bottom-nav con indicador de
  gradiente y tab "Carrito" (reemplaza a "Más", que solo abría el menú lateral que el header ya
  abre).
- **Tienda pública:** pestañas **Menú / Info / Reseñas** (antes las reseñas estaban al fondo de
  todo el scroll), **scroll-spy** en los chips de categoría (nunca se marcaban como activos), y la
  pestaña Info con el **horario semanal completo** (antes solo el de hoy).
- **Header del shell:** en escritorio era `sm:static sm:bg-transparent`, o sea desaparecía y
  dejaba dos íconos flotando. Ahora es sticky siempre, con el buscador; el botón de colapsar el
  sidebar también se ve en escritorio (era `sm:hidden` pese a que el sidebar es `collapsible`).

**Bugs encontrados y corregidos en el camino:**
- 🚨 **`src/lib` NO estaba en el `content` de `tailwind.config.ts`.** `lib/category-style.ts`
  define nombres de clase; los que no aparecieran en otro archivo **no se generaban, en silencio
  y sin error de build**. Misma familia que el bug `h-4.5`. **Regla: si un archivo de `src/lib`
  define clases de Tailwind, tiene que estar en `content`, y los nombres deben ser literales
  (nunca `` `from-cat-${key}` ``, el JIT escanea texto, no evalúa).**
- `h-4.5 w-4.5` no existe en Tailwind → los 4 íconos de la info card de la tienda quedaban sin
  tamaño aplicado. Ahora `h-[18px]`.
- La consulta de `reviews` de la tienda **no tenía `limit`**: bajaba TODAS las reseñas para
  mostrar 10 (viola la regla de escala de la Fase Y). Ahora `limit(20)`.
- Los chips de rubro del inicio se armaban desde las tiendas **sin filtrar**, así que una tienda
  pendiente de aprobación aportaba un chip que después daba 0 resultados.
- El `hover:shadow-lg` de la tarjeta no hacía nada: `<Card>` ya trae `shadow-lg` por defecto.
- Al meter pestañas, `scrollToReviews()` (el botón de rating de la info card) habría quedado
  muerto: ahora cambia de pestaña en vez de hacer scroll a un ancla oculta.
- Apilamiento sticky: los chips de categoría usaban `sticky top-14 sm:top-0` asumiendo que en
  escritorio no había header sticky. Corregido a `top-14` en todos los tamaños.

**Decisiones de costo (respetan las Fases Y/Z):** las secciones del inicio son particiones en
memoria del array ya cargado (**0 lecturas nuevas**); el ⌘K trae las tiendas con `getDocs` **una
sola vez al abrirlo por primera vez**, nunca con `onSnapshot` (vive en el shell = todas las
páginas); "Más de {rubro}" va con `where`+`limit`. **A propósito el ⌘K NO busca productos**: eso
necesitaría `collectionGroup('items')`, colección sin techo.

**Sin librerías nuevas:** todo con `tailwindcss-animate` (ya instalado) + keyframes CSS. No se
instaló `framer-motion` (≈35 kB de JS en el cliente, para un público que abre la app en Android
de gama baja). Se agregó un bloque `prefers-reduced-motion` que apaga las animaciones.

**Verificado a 430px y 1440px con datos reales:** sin overflow horizontal (430/430), sin errores
de consola; el scroll del inicio en celular bajó de **3.183px a 1.854px**; ⌘K abre con el atajo,
lista 18 ítems y filtra bien; las 3 pestañas de la tienda funcionan.

## Fase CC (ago 2026): Bloque operativo — backups de Firestore
Salió de una charla sobre qué infraestructura falta antes de lanzar (el usuario tiene el plan
Blaze y pidió aprovechar herramientas que ese plan habilita). Primer ítem: **no había ningún
backup** de la base — si alguien borraba/pisaba datos por error, no había vuelta atrás.
- **Backup automático nativo de Firestore** (feature de Blaze, sin Cloud Functions ni código):
  `firebase firestore:backups:schedules:create --retention 7d --recurrence DAILY`. Un backup
  completo por día, se conservan los últimos 7. Ya está corriendo en producción
  (`studio-354048519-4bc1e`, database `(default)`).
- Para restaurar (si algún día hace falta): `firebase firestore:databases:restore` apuntando a
  un backup de `firebase firestore:backups:list`. Restaura a una base NUEVA (no pisa la
  existente), así que es seguro probarlo sin miedo a perder la base actual.
- Costo: se factura como almacenamiento normal de Firestore (mismo precio por GiB que los
  datos en vivo) — al tamaño actual de la base, centavos por mes.
- **Sentry (monitoreo de errores).** Firestore no tiene equivalente a Sentry (Crashlytics es
  mobile-nativo, Performance Monitoring mide velocidad, no excepciones) — hacía falta una pieza
  aparte para dejar de depender de logs de Vercel que nadie mira. Setup manual (SDK v10, sin
  wizard — el wizard pide login interactivo en el navegador, no se puede automatizar):
  `@sentry/nextjs` instalado; `sentry.server.config.ts`/`sentry.edge.config.ts` (raíz del repo,
  `Sentry.init` con el DSN) + `src/instrumentation.ts` (los importa según
  `NEXT_RUNTIME`, y exporta `onRequestError = Sentry.captureRequestError` — **sin este export
  los errores de Route Handlers no llegan a Sentry**, se confirmó en vivo) +
  `src/instrumentation-client.ts` (init del lado cliente + `onRouterTransitionStart` para
  trazar navegaciones) + `next.config.js` con `experimental.instrumentationHook: true`
  (**obligatorio en Next 14**, deja de ser necesario recién en Next 15) envuelto en
  `withSentryConfig`. `src/app/global-error.tsx` (nuevo, captura errores del root layout) y
  `src/app/error.tsx` (ya existía, ahora también manda a Sentry) cubren errores de render.
  DSN en `NEXT_PUBLIC_SENTRY_DSN` (`.env.local`, no versionado — falta agregarlo a las env vars
  de Vercel para que capture en producción). `tracesSampleRate: 0.1` (10% de las requests, para
  no gastar la cuota gratis de golpe). **Verificado end-to-end contra el proyecto real de
  Sentry** (`javascript-nextjs`): un error de prueba lanzado desde una API route local apareció
  en el dashboard (Issues, Number of Errors) en segundos.
  - **`Sentry.captureException` agregado en los catches que más importan** (antes solo
    `console.error`, invisible fuera de los logs de Vercel): `/api/webhooks/mercadopago` (el
    caso que motivó todo esto — un fallo silencioso ahí deja un pago sin marcar), `/api/orders/create`,
    `/api/checkout`, y `checkout-dialog.tsx` (los dos catches: falla al buscar la tienda al
    abrir el diálogo, y falla al confirmar el pedido).
  - **Sin subida de source maps todavía** (falta `org`/`project`/`SENTRY_AUTH_TOKEN` en
    `withSentryConfig` — no se configuró aún): los stack traces en Sentry se ven con código
    minificado en vez de los nombres/líneas reales de `src/`. Mejora pendiente, no bloqueante
    (el error se captura igual, solo cuesta más leer el stack trace).

## Fase DD (ago 2026): primera tanda de análisis rol por rol
Después del bloque operativo (Fase CC) se retomó el pedido original de auditar cada rol
(comprador/tienda/repartidor/admin) para ver qué funcionalidad tiene y qué se podría sumar.
Antes de proponer nada se verificó el estado real del código (no memoria) con un agente de
exploración — varias cosas que se creían pendientes ya estaban resueltas (chat en vivo entre
comprador/tienda/repartidor vía `order_chats`, "Volver a pedir"), y otras confirmadas como
gaps reales. El usuario priorizó 3 de la lista para esta tanda:
- **Detalle de producto** (`src/app/stores/[storeId]/page.tsx`): tocar un producto (no el
  botón +/-) abre un `Dialog` (`ProductDetailDialog`, nuevo) con foto grande, descripción
  completa (sin `line-clamp`), precio con descuento y control de cantidad — antes tocar un
  producto no hacía nada, la única info visible era la de la tarjeta truncada.
- **Favoritos de producto** (`/favorites`): la pestaña "Productos" existía pero estaba
  `disabled` con un placeholder "Próximamente" y el array hardcodeado vacío. Ahora funciona de
  punta a punta: se guardan en la misma subcolección `users/{uid}/favorites` que los
  favoritos de tienda, distinguidos por `type:'product'` (campo que la interfaz ya
  anticipaba sin usar). El corazón para marcar/desmarcar vive en `ProductDetailDialog`
  (no en la tarjeta, para no ensuciar el grid). `favorites/page.tsx` filtra
  `favoritesData` por `type` para separar tiendas de productos.
- **Tope de pedidos simultáneos del repartidor** (`delivery-orders-view.tsx`): el código
  permitía tomar pedidos sin ningún límite (`myActiveOrders` es un array, nunca se validaba su
  tamaño). Nuevo `MAX_ACTIVE_ORDERS = 3` — guardrail de UX, **no de seguridad** (se valida
  client-side en `handleTakeOrder` y deshabilitando el botón "Tomar Pedido"; no se movió a
  `firestore.rules` porque contar pedidos activos del repartidor ahí requeriría una
  aggregation query dentro de la regla, que Firestore no soporta). El tab "En Curso" ahora
  muestra "N/3".
- **Verificado en el navegador real por el usuario** (no headless — Playwright sigue sin andar
  bien en este Windows, ver nota de la Fase Q): las 3 funcionan como se esperaba.
- **Quedó fuera de esta tanda, anotado en la lista de gaps de rol por rol para retomar
  después:** propinas al repartidor, cupones/promos de tienda (ya diferido desde Fase P/V),
  historial de pedidos del comprador sin filtro por estado/fecha, multi-usuario/empleados por
  tienda, niveles de permiso en el rol admin (hoy binario).

## Fase EE (ago 2026): segunda tanda rol por rol — historial con filtro + niveles de admin
- **Historial de pedidos con filtro** (`buyer-orders-view.tsx`): pestañas Todos/En
  curso/Entregados/Cancelados (agrupa los ~10 estados reales vía el mismo
  `getOrderStatusKind` de `order-status.ts`, sin inventar un mapeo nuevo) + buscador por
  nombre de tienda. Todo en memoria: los pedidos de UN comprador son un conjunto acotado
  (a diferencia de las colecciones sin techo de las Fases Y/Z), así que filtrar/buscar acá
  no viola esa regla.
- **Niveles de permiso en admin** (antes binario: `roles_admin/{uid}` sí/no). Nuevo campo
  opcional `roles_admin/{uid}.level`: `'full'` (todo el acceso, **default si no existe** —
  los admins creados antes de esta fase no pierden nada) o `'support'` (operativo: puede
  ver dashboard/pedidos/tiendas/repartidores/usuarios/reseñas/log, pero NO plata, config,
  broadcast, borrar cuentas, ni promover/degradar otros admins). Denormalizado también a
  `users/{uid}.adminLevel` para que la UI (badge, sidebar) lo lea sin una consulta aparte.
  - **`firestore.rules`**: nuevo `isFullAdmin()` (lee `roles_admin/{uid}.level` con
    `.get('level','full')`, el `.get(key,default)` de Map SÍ funciona en Firestore Rules —
    no es el mismo caso que el `firestore.get()` cruzado Storage→Firestore que falló en la
    Fase BB, acá es una lectura normal dentro del mismo servicio Firestore). Exigido en:
    escribir `roles_admin/{uid}` (el más crítico — si no, un 'support' podría reescribir su
    propio doc y autopromoverse), `config/{doc}` (settings), `withdrawals` update/delete
    (aprobar/rechazar retiros). Nuevo `isAdminRoleChange()` además exige `isFullAdmin()`
    para tocar el campo `role` de/hacia `'admin'` o el campo `adminLevel` de CUALQUIER
    usuario vía `users/{userId}` — cierra el mismo tipo de desincronización de la Fase R1
    (UI dice una cosa, el acceso real otra): antes un 'support' podría escribir
    `role:'admin'` en el perfil de otra cuenta (bypass porque `isAdmin()` ya alcanzaba para
    esa rama) mientras el `roles_admin` real fallaba, dejando una cuenta "admin" fantasma
    sin acceso real.
  - **`src/lib/auth-server.ts`**: nuevo `verifyFullAdmin(uid)`, usado en las 4 rutas
    admin-only que de verdad importan (`approve-withdrawal`, `notify-broadcast`,
    `delete-user`, `refund-order`) en vez del `roles_admin.doc(uid).get().exists` inline
    que tenían antes. `delete-review` se dejó en `isAdmin()` normal (moderar reseñas es
    tarea de soporte legítima).
  - **UI**: `AdminAuthGuard` ganó una prop `requireFullAdmin` (aplicada a
    `/admin/finances`, `/admin/settings`, `/admin/communications` — bloquea por URL directa
    aunque el link ya esté oculto); `main-nav.tsx` oculta esos 3 links para 'support';
    `admin/users/page.tsx`: al promover a alguien a admin ahora se elige nivel ("Hacer Admin
    completo/soporte"), un admin existente puede subir/bajar de nivel, y otorgar/quitar
    admin + borrar cuentas quedó oculto para actores 'support' (más allá de que el server
    ya lo rechaza, evita el viaje redondo y el estado a medias descrito arriba).
  - **Verificado contra producción real** con un script que baja temporalmente
    `admin@test.com` a `level:'support'` (Admin SDK), intenta las 4 acciones sensibles
    logueado con el SDK de CLIENTE (todas bloqueadas con `permission-denied`, incluida la
    auto-promoción), confirma que una acción normal de admin (leer pedidos) sigue
    funcionando, y restaura el nivel a `full` al final (`FieldValue.delete()`, ground truth
    confirmado con una lectura fresca después). `config/platform` quedó sin cambios y el
    doc de prueba de `roles_admin` nunca se llegó a crear. Script no quedó en el repo.
  - **Desplegado a producción** (`firebase deploy --only firestore:rules`, dry-run limpio
    antes de desplegar).

## Fase FF (ago 2026): reorganización del panel admin + 2 pantallas que faltaban
Pedido del usuario: el panel admin "le hacen falta varias cosas para poder llevar una app
con todos los datos que manejará" + reorganizar la navegación (menús desplegables,
mejor seccionado). Se auditó el panel completo antes de proponer nada — dos hallazgos
verificados en el código (no supuestos):
- **`payment_mismatches` no tenía NINGUNA regla de Firestore ni pantalla.** Es la
  colección donde el webhook de MP (K1) deja los pagos que no coinciden en monto/estado
  con la orden "para revisión manual" — pero no había forma real de revisarlos salvo
  entrando a la consola de Firestore a mano. Plata real sin resolver, punto ciego serio.
- **`driver_incidents`** (soltar pedido / reportar problema, Fase T) solo se veía como
  una vista previa de 8 en el dashboard, sin página propia, sin filtro, sin forma de
  marcarlos resueltos.
- Log de Acciones sin buscador/filtro; de paso se encontró que `ACTION_LABELS` nunca tuvo
  entradas para `approve_withdrawal` ni `refund_order` (se veían como texto crudo desde
  que existen esas acciones, bug previo a esta fase).

**Pantallas nuevas:**
- **`/admin/payment-issues`** — lista `payment_mismatches` (pestañas Pendientes/Resueltos),
  cada una con el detalle (monto pagado vs. total de la orden, o estado inesperado), link
  al pedido y botón "Marcar resuelto". Colección pensada para quedar casi siempre vacía
  (solo anomalías) — por eso usa un `limit(200)` defensivo simple en vez de la paginación
  por cursor de otras pantallas.
- **`/admin/incidents`** — historial completo de `driver_incidents` con paginación
  `getDocs`+cursor (esta sí puede crecer con el volumen de pedidos, a diferencia de la de
  arriba), pestañas Pendientes/Resueltos, botón resolver.
- **OJO con el patrón "resuelto" en ambas:** los documentos viejos no tienen el campo
  `resolved` — se tratan como pendientes con un filtro en MEMORIA (`resolved !== true`),
  nunca con un `where('resolved','!=',true)` — Firestore excluye del `!=` los documentos
  que no tienen el campo, así que esa query hubiera escondido justo los datos viejos que
  hay que revisar. El webhook de MP ahora escribe `resolved: false` explícito en los
  registros nuevos.
- **Log de Acciones**: buscador + `Select` de tipo de acción (filtro en memoria sobre la
  ventana de 200 ya cargada, sin query nueva); `ACTION_LABELS` completado con las 4
  acciones que faltaban (`approve_withdrawal`, `refund_order`, `change_admin_level`,
  `resolve_payment_mismatch`, `resolve_driver_incident`).
- **Dashboard** (`admin/page.tsx`): nueva alerta roja "N discrepancias de pago sin
  revisar" (antes cero visibilidad) y el widget de incidentes ganó un link "Ver todos" a
  la página nueva.

**Reglas de Firestore:** ambas colecciones ganaron `allow read: if isAdmin()` +
`allow update` restringido a `['resolved','resolvedAt','resolvedBy']` (marcar resuelto es
metadata operativa, cualquier nivel de admin puede hacerlo — no mueve plata por sí sola,
el reembolso real sigue yendo por `/api/admin/refund-order` que exige `full`).
`allow delete` en `payment_mismatches` quedó en `isFullAdmin()` por las dudas (no hay UI
para borrar, pero si alguna vez se agrega, que sea con el nivel más alto).

**Navegación** (`main-nav.tsx`): el menú admin (antes 10 links sueltos bajo un solo título
"Supervisión") pasó a 5 secciones colapsables — Operación / Finanzas / Confianza y
Seguridad / Comunicación / Sistema — con un `NavSection` nuevo (envuelve el `Collapsible`
de shadcn, ya instalado y sin usar desde la Fase AA). El estado abierto/cerrado de cada
sección se guarda en `localStorage` por sección (`admin-nav-section:{id}`) para que no se
resetee en cada navegación (cada `Link` del admin es una carga de página completa, no un
router push en cliente). "Sistema" arranca colapsada por defecto (es la que menos se
toca); el resto arranca abierta.

**Verificado por el usuario en su propio navegador** (dev server local): las 5 secciones
colapsan/expanden bien, `/admin/incidents` mostró los 5 incidentes reales que ya existían
en la base (de pruebas de la Fase T/W), `/admin/payment-issues` mostró el estado vacío
correcto (la colección está genuinamente vacía en este momento — no se fabricaron datos
de prueba de plata para no ensuciar una colección sensible), y el log de acciones mostró
el buscador/filtro nuevo.

**Desplegado a producción** (`firebase deploy --only firestore:rules`, dry-run limpio
antes de desplegar).

## Fase GG (ago 2026): panel admin como centro de control + 2 bugs graves de larga data
Pedido del usuario: "revisemos sección por sección... que sea un centro de control total,
que no se le pase nada por alto y que pueda encontrar cualquier cosa en cualquier
momento". Se auditaron las 12 páginas del admin con un agente de exploración antes de
tocar nada. De los ~30 hallazgos se atacaron los 3 críticos + 2 bugs encontrados al
verificar.

**🚨 BUG 1 — el ⌘K no respondía al CLICK (afectaba a TODA la app, no solo al admin).**
`src/components/ui/command.tsx` usaba `data-[disabled]:pointer-events-none`. Tailwind lo
traduce al selector `[data-disabled]`, que matchea si el **atributo existe**, sin importar
su valor — y cmdk v1 renderiza `data-disabled="false"` en los items HABILITADOS. Resultado:
**todos** los items del buscador quedaban con `pointer-events: none`; el click atravesaba
el item y lo recibía el contenedor padre. Funcionaba con teclado (flechas+Enter) y no con
mouse, por eso pasó desapercibido desde la Fase AA. Corregido a `data-[disabled=true]:`.
**Verificado con Playwright** (página de prueba aislada, borrada después): antes
`pointer-events: none` + el click lo recibía `DIV[GROUP-ITEMS]`; después `auto`, el click
cae dentro del item y `onSelect` dispara. **Regla para el futuro:** en Tailwind,
`data-[x]:` = "atributo presente"; si la librería emite `x="false"`, hay que escribir
`data-[x=true]:`.

**🚨 BUG 2 — el Log de Acciones nunca registró NADA desde que existe (Fase N).** La
colección `admin_audit_log` no tenía NINGUNA regla en `firestore.rules` → Firestore
denegaba por defecto todas las escrituras. Como `logAdminAction()` traga el error con un
`console.warn` para no interrumpir la acción principal, fallaba en silencio y la página
mostraba "No hay acciones registradas todavía", que parecía un estado normal. Se agregó la
regla: `read` solo admin; `create` solo con `adminUid == request.auth.uid` (un admin no
puede fabricar entradas a nombre de otro); **`update`/`delete` bloqueados incluso para
`isFullAdmin`** — un log de auditoría que se puede editar no sirve como evidencia. Además
`logAdminAction` ahora manda el fallo a Sentry (antes solo console.warn), así no vuelve a
quedar invisible.

**Crítico 1 — búsqueda global admin (no existía).** `global-search.tsx` estaba montado en
`/admin/*` pero con contenido 100% de comprador ("Mis Favoritos", "Abrir carrito"). Ahora
se bifurca por rol con 4 variantes: **admin** (pedido por ID exacto, usuarios por prefijo
de email O nombre, tiendas incluidas las no aprobadas, y las 12 secciones del panel
respetando `isFullAdmin`), **tienda** (sus propios productos + sus 8 secciones),
**repartidor** (sus 6 secciones) y **comprador** (el de siempre, intacto).
- Al elegir un cliente/admin se abre el `UserDetailDialog` (ficha + historial de pedidos)
  **encima de la página actual**: antes navegaba a `/admin/users?q=...` y, si ya estabas en
  esa página, la ruta no cambiaba y parecía que el click no hacía nada. Dueño de tienda y
  repartidor sí navegan a su ficha propia (tienen página dedicada con métricas y CBU).
- Si un dueño de tienda no tiene `storeId` en su perfil (pasó con `tienda@test.com`, ver
  bug de dato más arriba), la tienda se busca por `ownerId` entre las que el diálogo ya
  tiene cargadas — cero lecturas extra.
- **OJO — Firestore busca por PREFIJO, no por substring:** buscar "test.com" no encuentra
  "cliente@test.com". Además los rangos distinguen mayúsculas (`'D' < 'd'`), así que se
  consultan las dos variantes del nombre. El estado vacío explica cómo buscar en vez de
  dejar al admin pensando que el buscador está roto.
- A propósito el ⌘K del repartidor NO busca pedidos: los que le importan ya están en
  `/orders`, y `orders` es una colección sin techo (regla de las Fases Y/Z).

**Crítico 2 — el Log de Acciones tenía agujeros grandes.** Solo 9 acciones se registraban.
Se agregó `logAdminAction` en las que faltaban y eran de las más sensibles: aprobar/rechazar
tienda o repartidor (dashboard, `/admin/delivery` y ambos detalles), pausar/reactivar
tienda, editar tienda (incluye la comisión), editar CBU de tienda y de repartidor, cancelar
pedido, guardar configuración global (con el detalle de qué cambió), enviar broadcast y
eliminar tienda. `ACTION_LABELS` pasó de 9 a 18 entradas.

**Crítico 3 — colecciones sin paginar.** `withdrawals` (la única de plata que crece sin
techo) se bajaba ENTERA en `finance-view.tsx` para sumar en el cliente. Ahora: métricas por
**aggregation** (`sum('amount')`+`count()` por estado, mismo patrón de la Fase Z) y tabla
paginada con cursor de a 25 con **filtros server-side** (estado y rol van en la query, no en
memoria, para que "Pendientes" muestre todos y no solo los de la página cargada). 4 índices
compuestos nuevos de `withdrawals`, **desplegados a producción**.
- `stores` y `users where role=='delivery'` se dejaron SIN paginar a propósito: son
  colecciones acotadas por diseño (marketplace de pueblo) y `stores` ya se baja entera en
  el home del comprador. Paginarlas sería sobre-ingeniería; lo que sí les faltaba era poder
  encontrar y filtrar.

**Mejoras por página:**
- `/admin/stores`: chips de filtro (Todas/Pendientes/Aprobadas/Pausadas) con contador,
  columnas de **rubro** y **rating** (se habían perdido), badge de "Pausada", fila resaltada
  si está pendiente, export CSV, y el diálogo de borrado ahora aclara que los pedidos
  históricos quedan y sugiere pausar en vez de borrar.
- `/admin/delivery`: buscador (nombre/email/patente) y chips de filtro por estado — no tenía
  **ninguno** de los dos. Y el botón "Eliminar" **siempre fallaba** con un toast ("no
  habilitada todavía"); ahora borra de verdad vía `/api/admin/delete-user` (Auth+Firestore),
  igual que el equivalente de `/admin/users`, exigiendo `isFullAdmin`.
- `/admin/settings`: activar **Modo Mantenimiento** ahora pide confirmación — cortaba los
  pedidos de toda la plataforma con menos fricción que cancelar un solo pedido.
- `/admin/users`: reacciona al query param `?q=` aunque ya estés en la página (ver arriba).
- Menú: "Sistema" (donde vive Configuración) arrancaba **colapsada** por defecto y el
  usuario no la encontraba — ahora arranca abierta como el resto.

**Código muerto eliminado:** `admin/stores/stores-list.tsx` y `admin/stores/store-actions.tsx`
— dos implementaciones paralelas de la gestión de tiendas que ningún archivo importaba
(`admin/stores/page.tsx` reimplementó la suya). Confundían al auditar: su `AlertDialog`
prometía borrar "todos sus productos", cosa que el código vivo no hace.

**Nota de método:** Playwright **sí funciona** en este entorno Windows (contra lo anotado en
la Fase Q) — `npx playwright install chromium` + headless. Fue lo que permitió encontrar el
BUG 1, que ninguna cantidad de lectura de código habría revelado. Límite encontrado:
Firebase Auth rate-limitea por IP tras varios logins seguidos, así que conviene reusar
`storageState` en vez de loguear en cada test. Por eso quedaron sin verificar en vivo las
variantes de ⌘K de repartidor y comprador (el fix es el mismo patrón ya verificado en
tienda y admin).

## Fase HH (ago 2026): cierre de gaps del admin + rediseño del dashboard con volumen real
Continuación de la Fase GG (los 3 gaps que habían quedado anotados). En el medio se
sembraron datos de prueba para poder ver el panel con volumen, y eso destapó 3 bugs más.

**Los 3 gaps cerrados:**
- **`/admin/orders`:** búsqueda por **ID exacto server-side** (`getDoc` directo) que
  encuentra un pedido en todo el histórico aunque esté fuera del filtro de fecha/estado o
  en otra página — antes la búsqueda solo filtraba en memoria los 50 de la página cargada.
  Nombre de cliente/tienda siguen filtrando sobre la página (Firestore no hace substring y
  `orders` no tiene techo) y ahora la UI lo aclara en vez de dejar al admin adivinando.
- **`/admin/reviews`:** filtro por rating **server-side** (chips Todas/1-2★/3★/4-5★ con
  `where('rating','in',[...])`, índice nuevo `reviews (rating, createdAt)`), más un aviso
  arriba con el conteo real de críticas vía aggregation. Antes aislar las de 1-2 estrellas
  —justo las que hay que moderar— solo funcionaba sobre la página ya cargada.
- **`/admin/communications`:** historial de envíos. Nueva colección **`broadcasts`**, escrita
  por `/api/admin/notify-broadcast` con Admin SDK (`create: false` en las reglas: el cliente
  no puede fabricar envíos que nunca ocurrieron; tampoco se edita ni se borra). Lista los
  últimos 20 con destino/destinatarios/push, botón **"Reusar"** que recarga el mensaje en el
  formulario, y un **contador real de cuota** ("te quedan N de 5 envíos esta hora") calculado
  sobre el historial — antes el límite solo se conocía al chocar contra el 429.

**🚨 BUG — filtrar por estado en `/admin/orders` fallaba ("Error al cargar pedidos").**
Faltaba el índice compuesto `orders (status, createdAt)`. OJO: existía
`(status, deliveryPersonId, createdAt)`, que **no sirve** — Firestore exige que los campos
de igualdad usados sean prefijo exacto del índice. El bug era **previo a esta fase**: la
página siempre combinó `where('status')` + `orderBy('createdAt')`, pero el `useCollection`
viejo se tragaba el error y la lista quedaba vacía en silencio; al pasar a `getDocs` salió
a la superficie. De paso el catch ahora distingue `failed-precondition` y avisa "Falta un
índice de Firestore" en vez del genérico.

**🚨 BUG — "Siguiente" en `/admin/orders` nunca avanzó de página.** Leía
`(order as any)._snap` para el cursor, un campo que el hook `useCollection` **nunca
adjunta** (bug latente anotado en la Fase Z, confirmado y corregido acá). Pasó a
`getDocs`+cursor como el resto de las páginas paginadas.

**Contador de la lista engañoso:** decía "50 pedidos (página 1)", que se lee como si
hubiera 50 en total. Ahora: **"Mostrando 1-50 de 101 pedidos · página 1 de 3"**, con el
total por `getCountFromServer` respetando los filtros activos.

**Dashboard rediseñado** (a pedido explícito del usuario, tras dos iteraciones):
- **Pipeline visual del flujo** en vez de tarjetas sueltas: las 6 etapas como nodos
  conectados por una línea, con el número grande y **quién tiene la pelota** debajo ("la
  tienda debe confirmar", "el cliente debe pagar", "falta que lo tome un repartidor"...).
  El color progresa según de quién depende: gris (esperando) → ámbar (la tienda) → azul (en
  la calle). Debajo, dos zonas rotulan cuántos hay **en la tienda** y cuántos **en la calle**
  — dice de un vistazo si el cuello de botella es de comercios o de logística. Cada nodo
  enlaza a `/admin/orders?status=...` (esa página lee el query param y arranca en fecha
  "Todo" para no esconder los viejos). En móvil se apila vertical con la línea al costado.
- **Bandeja de atención unificada**: antes eran TRES bloques apilados (pedidos trabados /
  discrepancias de pago / incidentes de repartidor), cada uno con su marco de color,
  compitiendo y empujando el resto del dashboard fuera de pantalla. Ahora es un solo panel
  "Requiere tu atención" con pastillas de filtro por tipo (con su conteo), ordenado por
  gravedad REAL mezclando tipos (las discrepancias de pago primero siempre: es plata sin
  conciliar), y una **barra de severidad** por fila en lugar de teñir todo de rojo (rojo si
  lleva +24h trabado o es un problema reportado, ámbar si no). Se quitó el hash del pedido,
  que ocupaba lugar sin aportar.
- **`formatElapsed()`**: el tiempo se mostraba solo en horas, así que un pedido trabado de
  hace 3 meses decía **"hace 2261h 14m"** — correcto e ilegible. Ahora escala a días y
  meses ("hace 3 meses 4d"), manteniendo horas por debajo de 48h. Verificado con los
  valores reales que aparecían en pantalla.

**Datos de prueba (`seedBatch: 'QA-GG'`)**: se sembraron **15 tiendas** (12 aprobadas, 2
pendientes, 1 pausada) y **100 pedidos** (80 dentro de 30 días para que la paginación de a
50 se note, 20 más viejos para probar el filtro "Todo") repartidos en los 9 estados reales.
La base tenía **1 sola orden** antes de esto — por eso no se podía probar nada con volumen.
El script (`_seed-qa.js`, fuera del repo) tiene `--undo` para borrar los 115 documentos de
una pasada. **Pendiente: borrarlos antes de lanzar** (ver pendientes abajo). Se agregó
`_*.js`/`_*.mjs` al `.gitignore` para que estos scripts no se cuelen al repo.

**Headline cards del dashboard, con desglose:** el monto salía como `$1953560.00`
(`toFixed(2)`: sin separador de miles y con el punto donde va la coma en Argentina) y los
tres números no tenían con qué compararse. Nuevo helper `money()` (`toLocaleString('es-AR')`,
sin decimales) y cada tarjeta ahora desglosa lo que su número esconde: **Facturado** →
comisión de la plataforma / envíos a repartidores / lo que va a las tiendas / ticket
promedio; **Usuarios** → por rol; **Entregados** → sobre el total, con tasa de entrega y
barra de color (verde ≥70%, ámbar ≥40%, rojo abajo).

**🚨 TRAMPA DE FIRESTORE — varias sumas en una misma aggregation.** Al intentar agregar
`sum('serviceFee')` y `sum('deliveryFee')` a la aggregation que ya hacía `sum('total')`,
**TODAS las tarjetas se fueron a $0**. Firestore exige un índice que cubra el filtro MÁS
todos los campos agregados **a la vez**: tener `(status,total)`, `(status,serviceFee)` y
`(status,deliveryFee)` por separado NO alcanza para pedirlas juntas. La query falla con
`failed-precondition` y `useAggregate` se tragaba el error, así que el síntoma era cero en
todo sin ninguna pista. **Regla: una aggregation por campo sumado, cada una con su índice**
(o crear el índice combinado, si algún día se quiere ahorrar la lectura extra).
- Como consecuencia se endureció `src/lib/firebase-aggregate.ts`: `useAggregate` ahora
  **expone `error`** y ambos hooks reportan el fallo a **Sentry** (antes solo un
  `console.error` suelto). El dashboard muestra un aviso "falta un índice de Firestore" en
  vez de mostrar $0 como si no hubiera ventas.

**Costo a escala del dashboard — anotado, NO resuelto (a propósito).** El dashboard hace
hoy 8 consultas de agregación (3 sobre Entregado, 4 counts de usuarios, 1 count de todas
las órdenes) y Firestore cobra ~1 lectura por cada 1000 docs escaneados. Con el volumen
actual son ~8 lecturas por carga (nada); con ~100.000 pedidos serían **~210 lecturas por
carga**, y como varias tienen `refreshOnFocus` se repiten cada vez que se vuelve a la
pestaña: ~6.300 lecturas/día para UN admin que lo abra 30 veces (≈12% de la cuota gratis
diaria). **Cuándo actuar:** recién en decenas de miles de pedidos. **Solución cuando toque:**
un documento `stats/platform` con los totales precalculados (actualizado por el cron que ya
existe en `/api/cron/generate-settlements` o por un trigger), que baja las ~210 lecturas a 1.
No se hizo ahora porque a escala de Tinogasta sería sobreingeniería.

**Nota de método:** Firebase Auth **rate-limitea por IP** tras varios logins seguidos, y
`storageState` de Playwright **no sirve para reusar la sesión** porque Firebase guarda el
token en IndexedDB (que storageState no captura). Conclusión práctica: hacer login UNA vez
por script y verificar todo en esa misma corrida, no un script por chequeo.

## Fase II (ago 2026): auditoría de Finanzas — 3 agujeros que hacían perder plata real
Pedido del usuario: revisar el admin sección por sección, "con respecto a pagos y finanzas
necesitamos mejorar mucho ese panel". La auditoría encontró que la fórmula de saldos tenía
tres defectos que le hacían pagar a la plataforma plata que nunca recibió.

**Corrección de método antes de nada:** el primer análisis se apoyó en que "37% de los
pedidos entregados son en efectivo" — pero ese dato era **del seed que yo mismo generé**
(`Math.random() > 0.35`). Al filtrar por `seedBatch`, la base tenía **UN solo pedido real**
y era por MercadoPago. Nunca usar datos de prueba propios como evidencia del negocio.

**🚨 1 — El pago en EFECTIVO rompía el modelo de saldos.** `payout-service.ts` no miraba
`paymentMethod` en ningún lado (0 referencias), pero en efectivo el repartidor cobra **el
total completo en mano** ("Debes recibir $X en efectivo"). Con un pedido de $10.000:
el repartidor se queda con los $10.000, y encima el sistema le acreditaba $2.000 de envío
a él y ~$7.500 a la tienda — plata que la plataforma **nunca recibió**. Medido sobre la
base actual: **$522.848 de más a tiendas + $36.000 de más a repartidores**.
- **Decisión de producto: la app queda SOLO DIGITAL.** Se evaluó con el usuario; el costo
  del efectivo no es técnico (media hora de código) sino operativo: rendiciones semanales,
  control de mora, qué hacer si un repartidor no deposita. Para un operador solo, no rinde.
  Argentina además tiene una penetración altísima de MercadoPago.
- **Hallazgo:** la app YA era solo digital de hecho — `CheckoutDialog` ni siquiera manda
  `paymentMethod`, así que caía en el default `'mercadopago'`. Pero `/api/orders/create`
  aceptaba **cualquier valor del body**: se agregó `ALLOWED_PAYMENT_METHODS` y se rechaza
  server-side.
- `payout-service` ahora **excluye los pedidos en efectivo** del saldo (protege ante
  cualquier pedido histórico). **Si algún día se reactiva el efectivo, hay que modelar la
  RENDICIÓN del repartidor** (descontar de su saldo lo que cobró), no volver a incluirlos.

**🚨 2 — Los reembolsos no descontaban del saldo.** `/api/admin/refund-order` marca
`order.refunded`/`refundAmount`, pero el saldo sumaba el pedido entero igual: el admin
devolvía la plata al comprador Y la tienda/repartidor la cobraban lo mismo. Se descuenta
proporcional (`refundRatio`) usando el campo que ya vive en la propia orden, sin query
extra. De paso: `refunded`/`refundAmount` **no existían en el tipo `Order`**, por eso las
billeteras los ignoraban.

**🚨 3 — 5 de 21 tiendas operaban con comisión 0%.** `commissionRate || 0`: una tienda dada
de alta sin comisión explícita trabajaba gratis para siempre sin que nadie lo notara. Nuevo
`config/platform.defaultCommissionRate` (editable en **/admin/settings**, default 10%) que
se aplica a las tiendas sin tarifa propia.

**Las 3 fórmulas de saldo estaban duplicadas y ahora coinciden.** `my-store/wallet` y
`delivery/earnings` recalculaban el saldo en el CLIENTE con la fórmula vieja, así que la
tienda veía $1.646.253 disponibles mientras el servidor solo aprobaba $1.123.406 — retiro
rechazado sin explicación. Las tres (servidor + las dos billeteras) aplican ahora el mismo
criterio: sin efectivo, menos reembolsos, con comisión por defecto. **Al tocar una hay que
tocar las tres** (idealmente algún día unificarlas de verdad).

**Pendiente de Finanzas, NO resuelto (anotado):** el `serviceFee` (5% al cliente) no está
modelado como ingreso en ningún cálculo de saldo — solo se muestra en el dashboard; falta
un **estado de cuenta** por tienda/repartidor (facturado / cobrado / deuda con detalle de
movimientos); no hay **conciliación con MercadoPago** (contrastar lo que dice el sistema
contra lo que entró de verdad a la cuenta); y `computeStoreBalance` baja **todos** los
pedidos entregados de la tienda sin `limit`, lo que a escala revienta (y corre en cada
aprobación de retiro).

## Fase JJ (ago 2026): circuito de pagos — separar tienda de repartidor + trazabilidad
Pedido del usuario: "separemos la forma de pagar a una tienda y a los de delivery, para que
no se mezclen... organizar esos pagos para nunca llegar a confundirse", y revisar la
solicitud de pago automática.

**Cómo funciona el circuito (para referencia):** un pago nace de dos formas, ambas terminan
en la colección `withdrawals` — **manual** (la tienda lo pide en `/my-store/wallet`, el
repartidor en `/delivery/earnings`, `source:'manual'`) o **automática** (el cron de Vercel
corre diario 14:00 UTC y, si es el día de `config/platform.settlementDayOfWeek`, genera las
solicitudes con el saldo completo, `source:'auto'`). El admin las aprueba en Finanzas.
**Aprobar NO transfiere nada**: la transferencia la hace el admin por fuera (banco/MP) y
después marca la solicitud.

**🚨 1 — Los pagos de tienda y de repartidor se pisaban entre sí.** El chequeo de "¿ya tiene
un pago pendiente?" en el cron filtraba **solo por `userId`, sin `userRole`**. Una persona
que fuera dueña de tienda Y repartidor (mismo uid) se bloqueaba a sí misma: un pendiente
como tienda impedía generar el de repartidor y viceversa. Se agregó `where('userRole')` en
ambos lados + índice nuevo `withdrawals (userId, userRole, status)`.

**🚨 2 — No quedaba ningún registro de la transferencia real.** Al aprobar solo se escribía
`status:'approved'` y la fecha: no se sabía **qué admin** autorizó el pago ni había forma de
rastrearlo en el banco si la tienda reclamaba "no me llegó". Ahora `/api/admin/approve-withdrawal`
**exige `operationRef`** (número de operación/comprobante, mínimo 4 caracteres) y guarda
además `approvedBy`, `adminNote` opcional y `balanceAtApproval` (el saldo real en el momento
de aprobar). Del lado UI, el `confirm()` nativo se reemplazó por un diálogo que muestra
destinatario, tipo, CBU y monto, y pide el comprobante — el botón queda deshabilitado sin él.
El número de operación aparece en la tabla bajo el estado y en el CSV.

**🚨 3 — El cron usaba el campo equivocado para elegir repartidores.** Filtraba por
`status === 'Activo'`, pero el gate real de "este repartidor opera" es **`isApproved`** (son
dos campos que ya se desincronizaron una vez, ver Fase R1). Un repartidor aprobado con el
`status` desfasado **no cobraba**. Corregido a `where('isApproved','==',true)`.

**4 — El día de liquidación se evaluaba en UTC.** `new Date().getDay()` en Vercel es UTC;
hoy no se notaba (14:00 UTC = 11:00 ART, mismo día) pero bastaba mover el horario del cron
para que la liquidación se generara el día equivocado. Ahora usa `nowInArgentina()`, el
mismo helper que el horario de tiendas.

**Separación visual (lo pedido):** los pagos a tiendas y a repartidores dejaron de ser un
chip más entre otros. Ahora son **tres tarjetas-pestaña** arriba de todo — "Todos los pagos"
/ "A tiendas" (venta de productos) / "A repartidores" (envíos realizados) — y la tabla queda
acotada a ese circuito. El filtro por estado quedó debajo, dentro del circuito elegido.
**Verificado:** al elegir "A repartidores" la tabla muestra solo filas de rol Repartidor.

**Reembolsos — mismo criterio.** Salió de la pregunta "¿a dónde se reembolsa?": a ningún
lado, el sistema **no mueve plata** (la devolución la hace el admin en MercadoPago, igual
que las transferencias). Tenía el mismo agujero que los retiros: (a) le avisaba al comprador
**"Reembolso procesado"** aunque nadie hubiera devuelto nada todavía — si el admin se
olvidaba, el cliente quedaba esperando; (b) no había dónde anotar el comprobante. Ahora
`/api/admin/refund-order` **exige `operationRef`** (se guarda en `refunds` y en el propio
pedido como `refundOperationRef`/`refundedBy`), el mensaje al comprador pasó a "Devolvimos
$X... puede tardar unos días en acreditarse", y el diálogo aclara el orden correcto:
**primero devolvés en MercadoPago, después lo registrás acá** (antes el texto decía
"recordá hacer la devolución", que es justo como se olvida).

**Pendiente anotado:** "aprobado" sigue mezclando dos momentos distintos ("reviso y
autorizo" vs "ya transferí"). Hoy se resuelve con el comprobante obligatorio, pero si el
volumen crece conviene un estado intermedio explícito.

## Fase KK (ago 2026): auditoría completa del sistema de dinero
Pedido textual: *"necesito entender completamente cómo va a funcionar el sistema de dinero...
si hay algún número que no se cuente, si alguna operación quedaría sin registrarse, si puede
llegar a pasar que desaparezca un número del registro, que el conteo del panel esté mal y
pague mal. Si falla el dinero falla la confianza del sistema."* Se auditó el ciclo completo
(creación → pago → entrega → liquidación → reembolso) con 3 agentes en paralelo y **cada
hallazgo se re-verificó personalmente leyendo el código**. Salieron 10 agujeros reales.

**Contexto que hizo seguro cambiar el reparto:** la base tenía **1 sola orden real** y
**ningún pago aprobado real** (todo lo demás era seed). Nadie había cobrado nada todavía.

**Corrección de método (vale para el futuro):** el primer análisis se apoyó en "37% de los
pedidos entregados son en efectivo" — dato que salía **del seed que yo mismo generé**
(`Math.random() > 0.35`). Nunca usar datos de prueba propios como evidencia del negocio.

### 🚨 Lo que estaba roto en producción sin que se notara
- **NINGUNA liquidación por el saldo completo era aprobable.** `computeStoreBalance` ya
  restaba los retiros `pending`, y `approve-withdrawal` validaba contra ese mismo número —
  o sea el retiro se restaba a sí mismo. Con saldo 10.000 y un pedido de 10.000: "supera el
  saldo real disponible ($0)". Y el cron genera exactamente el saldo completo, así que
  **toda la liquidación automática era inoperante**. Se separó en dos conceptos:
  `availableBalance` (menos aprobados Y pendientes: lo que el usuario puede *pedir*) y
  `approvableBalance` (menos aprobados solamente: contra lo que se valida al *aprobar*).
- **El comprador fijaba el precio que pagaba.** La regla de `orders` dejaba reescribir
  `items` (con su `price`) y `confirm-stock` recalculaba el subtotal desde ese array. Un
  pedido de $20.000 se podía pagar $2.000. La calificación de productos (única razón por la
  que `items` era escribible) se movió a un campo aparte `itemRatings`, y `confirm-stock`
  ahora **relee los precios del catálogo** en vez de confiar en el documento.
- **Reembolsos y contracargos de MercadoPago eran invisibles**: el webhook retornaba sin
  registrar nada si el `status` no era `approved`. La orden quedaba `paid` para siempre y se
  liquidaba plata ya devuelta. Ahora `refunded`/`charged_back`/`cancelled` quedan en
  `payment_mismatches` (`payment_reversed`), lo mismo un **segundo `paymentId`** sobre una
  orden ya pagada (`duplicate_payment` = doble cobro), y se persiste el `transaction_amount`
  real (`paidAmount`) — sin ese dato no hay conciliación posible.
- **Envío hardcodeado** (`FIXED_SHIPPING_COST = 2000`) en `confirm-stock` mientras `create`
  ya leía `config/platform.deliveryFee`: cambiar el fee descuadraba los totales.
- **El `serviceFee` se le pagaba a la tienda** (la base era `total − deliveryFee`, que
  incluye el fee). Decisión del usuario: **el serviceFee es de la plataforma**. Medido: se
  le estaba pagando **$53.496 de más** a las tiendas sobre la base actual.
- **Retiros de monto arbitrario**: la regla solo podía validar `amount > 0`. No permitía
  cobrar de más (la aprobación recalcula), pero **congelaba el cron** de esa cuenta (saltea
  a quien tiene un `pending`). **Verificado en vivo con una cuenta real**: se creó un retiro
  de $99.999.999 desde el SDK de cliente. Cerrado: `create: if false` + toda la creación por
  `/api/withdrawals/request`, que valida contra el saldo real server-side.
- **El admin podía reescribir/borrar plata sin rastro** (`orders` y `withdrawals` con update
  libre). Borrar un `approved` subía el saldo → cobrar dos veces. Ahora `withdrawals` es
  `delete: if false` y el update está acotado por `affectedKeys().hasOnly([...])`; el admin
  tampoco puede tocar campos de dinero de `orders` por escritura directa.
- **Cancelar un pedido ya pagado no dejaba ningún pasivo registrado.** Ahora genera un
  `payment_mismatches` (`cancelled_after_payment`) y marca la orden.
- **Comisión retroactiva:** el saldo histórico se recalculaba con la comisión *actual* de la
  tienda. Decisión del usuario: **la comisión se congela en cada pedido**
  (`commissionRate`/`commissionAmount` dentro de la orden).
- **`Math.max(0, …)` escondía la deuda:** si se reembolsaba después de liquidar, el saldo
  quedaba en $0 y nadie veía que se había pagado de más. Ahora hay un campo `debt` aparte.

### La pieza que evita que esto vuelva a pasar: `src/lib/money.ts`
La fórmula de reparto estaba escrita **tres veces** (servidor + las dos billeteras) y cada
arreglo desincronizaba las otras: la tienda veía $1.646.253 disponibles mientras el servidor
solo aprobaba $1.123.406, y el retiro rebotaba sin explicación. Ahora hay **un solo módulo
de funciones puras** (`storeNetForOrder`, `driverNetForOrder`, `platformNetForOrder`,
`storeBaseAmount`, `refundRatio`, `commissionForOrder`) sin Firestore adentro, importable
tanto por el cliente como por el Admin SDK. `payout-service.ts` quedó reducido a consultar
pedidos/retiros y restar. **Regla: cualquier cambio en cómo se reparte la plata va en
`money.ts`, en ningún otro lado.**

### Que el panel diga la verdad
- `admin/stores/[storeId]` y `admin/delivery/[driverId]` calculaban el saldo con fórmulas
  propias (sin reembolsos, sin excluir efectivo, con `commissionRate || 0`): el admin veía
  un saldo MAYOR al que el servidor iba a autorizar. Ahora usan `money.ts`. Las métricas de
  tienda además **aclaran que son sobre los últimos 50 pedidos** (antes mentían en silencio).
- `finance-view` **ignoraba el circuito elegido**: al filtrar "A repartidores" la tabla
  mostraba repartidores pero los totales de arriba seguían siendo de toda la plataforma.
  Ahora el `userRole` viaja en la aggregation (índice nuevo `withdrawals (status, userRole,
  amount)`), y las pestañas de circuito subieron ARRIBA de las tarjetas para que se entienda
  qué filtra qué.
- **"Total en sistema" era un número que no significaba nada** (pendiente + pagado +
  rechazado: mezcla plata que salió con plata que nunca salió, y cuenta el mismo retiro dos
  veces a lo largo de su vida). Reemplazada por **"Pasivo real"** vía
  **`/api/admin/liability`** (nueva): cuánto se debe HOY *incluida la plata que nadie
  solicitó todavía* — eso no vive en `withdrawals`, hay que calcularlo desde los pedidos
  entregados. Usa las mismas funciones que la aprobación, así que no puede desincronizarse.
  Se dispara **con un botón** (es O(tiendas + repartidores)); muestra el top 10 de a quién
  se le debe y **quién quedó sobrepagado**.
- `delivery/analytics` sumaba `deliveryFee` crudo; `my-store/analytics` mostraba el bruto sin
  aclarar que incluye envío y comisiones (se leía como "lo que voy a cobrar").
- Las dos billeteras filtran los retiros por `userRole`: quien fuera tienda **y** repartidor
  veía descontados los retiros del otro circuito.

### Trazabilidad
- **`src/lib/admin-audit-server.ts` (nuevo):** aprobar/rechazar retiro, reembolsar y borrar
  cuentas registran en la **misma request** que mueve la plata. Antes lo escribía el cliente
  después de recibir el OK: si el navegador se cerraba justo ahí, la plata se movía **sin
  autor**. Las entradas del servidor llevan `source: 'server'`.
- **`/api/admin/reject-withdrawal` (nueva):** rechazar devuelve plata al saldo y era un
  `updateDoc` directo sin `rejectedBy`. Además ya no se puede rechazar algo `approved` (eso
  devolvería al saldo plata ya transferida → cobrarla dos veces).
- **Borrar cuentas/tiendas con plata sin cobrar se frena.** El saldo se calcula desde el doc
  de usuario/tienda: sin él la deuda deja de ser calculable y desaparece del pasivo. Borrar
  igual exige un `force` explícito y queda el monto en el log.
- **Log de acciones paginado con cursor** y con filtro por acción **server-side** (era
  `limit(200)` fijo sobre justo la colección que no puede perder registros viejos; índice
  nuevo `admin_audit_log (action, createdAt)`). Se agregaron `edit_store`/`delete_store` a
  las etiquetas — `edit_store` es la acción que cambia la COMISIÓN de una tienda.
- **Resolver una discrepancia de pago exige explicar cómo se resolvió** (`resolutionNote`):
  "resuelto" sin decir qué se hizo con esa plata no sirve dentro de seis meses.
- Los pedidos con problema de pago se marcan en `/admin/orders` con un badge que linkea a
  `/admin/payment-issues` (antes solo se veían desde la lista de discrepancias).

### Verificación (scripts fuera del repo, gitignored por `_*.js`)
- **`_audit-money.js`** — conciliación completa, no escribe nada. Resultado sobre la base
  real: **tienda $1.069.910 + repartidores $62.000 + plataforma $197.650 = $1.329.560 = total
  cobrado ✅ CUADRA**, 0 discrepancias en 49 pedidos entregados, pasivo total $1.126.610.
- **`_attack-money.js`** — 7 intentos de fraude con el **SDK de cliente** (el único que pasa
  por las reglas), con lectura de ground truth por Admin SDK después. Antes de desplegar: 2
  pasaban (crear retiros directos). Después: **los 7 bloqueados**.
- **`_e2e-payout.js`** — flujo de pago completo contra la API real: pedir de más (rechaza),
  pedir el saldo COMPLETO (crea), aprobar sin comprobante (rechaza), aprobar (OK), aprobar
  dos veces (rechaza), saldo queda en 0, y el log de auditoría tiene UNA entrada escrita por
  el servidor. **13/13 OK.** Limpia lo que crea.
- **`_backfill-commission.js`** — congeló `commissionRate`/`commissionAmount` en los 101
  pedidos existentes (dry-run primero). No movió ningún total ni ningún saldo.
- Los dos caminos independientes (script de conciliación y `/api/admin/liability`) dan el
  **mismo pasivo total**. El de la API encontró un caso que el script se perdía (una tienda
  con retiro aprobado y 0 ventas) — el script se corrigió para recorrer también las cuentas
  que cobraron sin tener pedidos.
- **Reglas e índices desplegados a producción** (dry-run limpio antes).

**OJO al escribir tests de reglas:** `diff(resource.data).affectedKeys()` compara **valores**.
Reescribir un campo prohibido con **el mismo valor** da un diff vacío y la regla lo deja
pasar — no es un agujero (no cambia nada), pero da un falso positivo en un script de ataque.
Hay que escribir un valor distinto al actual.

### Pendiente de Finanzas, anotado y NO resuelto
- **Conciliación automática con MercadoPago** (contrastar contra la API de MP lo que
  realmente entró): la única forma de detectar plata que MP retuvo o devolvió sin webhook.
  Requiere decidir frecuencia y manejo de diferencias.
- **Estado intermedio "autorizado" vs "transferido"** en los retiros (hoy `approved` mezcla
  ambos; mitigado con el comprobante obligatorio).
- **Estado de cuenta** por tienda/repartidor (facturado / cobrado / deuda con movimientos).
- `computeStoreBalance` baja **todos** los pedidos entregados de la tienda sin `limit`, y
  corre en cada aprobación de retiro y en cada cálculo de pasivo. A escala hay que
  denormalizar (un `stats/` o un acumulador por cuenta).
- **Devolución de stock** en cancelaciones y en ítems removidos por `confirm-stock`: es un
  agujero de inventario real detectado en la auditoría, pero no es dinero — merece su propia
  pasada.
- 5 retiros del seed quedaron `approved` **sin número de operación** (son anteriores a que
  fuera obligatorio) y una tienda del seed ("Pizzería de Prueba") figura con $8.000 de deuda.
  Se van con la limpieza del seed pre-lanzamiento.

## Fase LL (ago 2026): una tienda podía tomar pedidos como repartidor + billetera que avisa
Salió de dos preguntas del usuario: "¿los paneles de finanzas de tienda/repartidor están
completos y bien conectados?" y, aparte, "no me parece buena idea que una tienda pueda ser
repartidor o viceversa; que se cree una cuenta aparte". La segunda destapó un agujero real.

### 🚨 El agujero de roles (verificado en vivo ANTES de tocar nada)
`isApprovedDriver()` en `firestore.rules` solo leía `users/{uid}.isApproved`. **Pero
`isApproved` es un campo COMPARTIDO**: el flujo de aprobación del admin
(`admin/page.tsx:handleUpdateUserStatus`) lo escribe en `users/{uid}` tanto para
repartidores **como para dueños de tienda** (y también en `stores/{id}`). O sea que
cualquier tienda aprobada cumplía la condición de "repartidor aprobado".
- **Probado contra producción con el SDK de cliente:** `farmacia@test.com` (role `store`,
  `isApproved: true`) tomó un pedido de **otra tienda** ("Super Los Aromos"), se puso como
  `deliveryPersonId` y lo pasó a "En camino". La UI no muestra el botón — pero la regla lo
  permitía, y las reglas son lo único que separa a un atacante de la base.
- **La plata NO se fugaba** (esto se verificó, no se asumió): el cron de liquidación filtra
  `where('role','==','delivery')` y `/api/withdrawals/request` compara el rol contra
  Firestore. El daño era **operativo** (robar pedidos de la competencia y dejarlos trabados)
  más ganancias de reparto que nadie iba a poder cobrar nunca.
- **Fix:** `isApprovedDriver()` ahora exige además `role == 'delivery'`.

**Decisión de producto del usuario: una cuenta es tienda O repartidor, nunca las dos.** Quien
quiera hacer ambas cosas se crea una cuenta aparte. `users/{uid}.role` ya era un solo valor,
así que el alta nunca podía producir el estado mezclado; el único camino que quedaba era que
un admin cambiara el rol de un dueño de tienda — `/admin/users` ahora lo frena con el nombre
de la tienda en el mensaje. Auditoría de la base: **0 cuentas con roles mezclados**.

### La billetera ahora avisa
- **Aprobar o rechazar un retiro no notificaba NADA.** La plata se transfería y la
  tienda/repartidor se enteraba solo si entraba a mirar su billetera por las suyas. Ahora
  llega campanita + push, con el **comprobante** si se pagó y con el **motivo** si se rechazó.
- **El motivo del rechazo se guardaba pero no se mostraba en ninguna pantalla**: veían
  "Rechazado" sin saber qué corregir. Ahora se ve en las dos billeteras, junto al comprobante
  de las transferencias aprobadas.
- **Bug encontrado de paso:** la campanita mandaba los avisos de pago a `/orders?tab=wallet`,
  una pestaña **eliminada en las Fases P y R** (mostraba números fantasma). El link estaba
  muerto desde entonces. Ahora va a `/my-store/wallet` o `/delivery/earnings` según el rol, y
  la propia notificación trae el `link`.
- **Nuevo `src/lib/notify-server.ts`**: campanita + push desde el servidor, en un solo lugar.
  El patrón estaba inline en `refund-order` y se iba a repetir en cada ruta nueva — misma
  lección que `money.ts`. No lanza nunca (avisar no debe abortar una transferencia ya hecha)
  pero reporta a Sentry.

### 🚨 Error de método propio, vale la pena recordarlo
El primer "✅ bloqueado" del script de ataque fue un **falso positivo que yo mismo causé**. El
revert usaba `beforeData.deliveryPersonId ?? FieldValue.delete()`, y **`??` trata `null` como
nullish**: el campo valía `null`, así que se **borró** en vez de restaurarse. Sin ese campo, la
regla `resource.data.deliveryPersonId == null` deja de evaluar y bloquea a **todos** — el
ataque parecía cerrado y en realidad estaba roto el pedido. Se detectó porque la prueba de
regresión (repartidor legítimo) también falló. Se reparó el pedido y se corrigió el script para
distinguir "no existía" (`k in before`) de "valía null".
**Dos reglas que quedan de esto:** (1) en un script de reversión, nunca `??` sobre campos que
legítimamente pueden ser `null`; (2) **todo endurecimiento de reglas necesita su prueba de
regresión en la misma corrida** — bloquear al atacante no sirve si también bloqueás al usuario
real, y sin ese segundo chequeo el falso positivo pasa desapercibido.

### Verificación
- `_attack-roles.js` — ataque + regresión en la misma corrida: tienda **bloqueada**,
  repartidor legítimo **sigue pudiendo tomar el pedido**. Revierte lo que toca.
- `_audit-roles.js` — busca cuentas con roles mezclados (dueño de tienda con otro rol,
  repartidor con rol distinto de `delivery`). **0 casos.**
- `_e2e-payout.js` ampliado a **21/21**: ahora también verifica que la notificación de pago
  llegue con el comprobante y apunte a la billetera, y todo el flujo de rechazo (motivo
  guardado, `rejectedBy`, notificación con el motivo, no se puede rechazar dos veces).
- `_check-clean.js` — confirma que no quedó basura de las pruebas (retiros/notificaciones/
  auditoría de test, pedidos con campos rotos). **Base limpia.**
- Reglas desplegadas a producción (dry-run limpio antes). Build, typecheck y lint limpios.

## Fase MM (ago 2026): el inventario descontado nunca volvía
Último pendiente anotado de la Fase KK ("devolución de stock… es un agujero de inventario
real, pero no es dinero — merece su propia pasada"). Se verificó primero en el código en vez
de confiar en la nota: `/api/orders/create` descuenta stock dentro de una transacción
(línea 194), y `cancel` / `confirm-stock` / `refund-order` **no lo mencionan ni una vez**.

**Medido antes de tocar nada** (`_audit-stock.js`): 7 pedidos cancelados/rechazados con 25
unidades colgadas — **todos del seed, 0 reales** — y solo 6 de 36 productos con stock finito.
O sea el bug **todavía no había mordido**, por dos razones que no iban a durar: casi ningún
producto lleva stock cargado y todavía no hubo una cancelación real. Se activaba solo el día
que una tienda cargara stock y le cancelaran un pedido.

### `src/lib/stock-service.ts` (nuevo)
Espejo exacto de `create`, y por eso repite sus dos reglas: busca el producto en `products` y
después en `items` (compat legacy), y **solo toca productos con `stock != null`** — sin valor
significa "sin límite", y escribir el campo ahí le pondría un techo al producto por accidente.
- **Idempotencia:** la marca (`stockReturnedAt`) se escribe en la **misma transacción** que el
  stock. Cancelar dos veces no infla el inventario — el error inverso, y bastante más difícil
  de detectar que el original.
- Usa `FieldValue.increment` en vez de leer-sumar-escribir: si la tienda repuso mientras tanto,
  la devolución se suma a lo nuevo en vez de pisarlo.
- No relanza (devolver stock no debe abortar una cancelación que ya ocurrió) pero reporta a
  Sentry: es inventario real, el fallo no puede morir en un log.

### Los tres caminos
- **Cancelar** (`/api/orders/cancel`) devuelve las unidades.
- **Rechazar**: era un `updateDoc` directo del cliente, así que no había servidor que pudiera
  devolver nada. Ahora va por **`/api/orders/reject`** (nueva). **Había DOS caminos de rechazo**
  — `store-orders-view.tsx` y `order-status-updater.tsx` — y los dos apuntan ahora a la API;
  olvidarse de uno es exactamente lo que pasó en la Fase R1. La regla de `orders` dejó de
  aceptar `'Rechazado'` del cliente para que el bypass no exista.
- **`confirm-stock`**: los ítems que la tienda destilda van a **stock 0**, no vuelven.
  **Decisión de producto del usuario**, y a propósito NO es el inverso de `create`: la tienda
  acaba de decir "no tengo esto", así que devolver las unidades dejaría el catálogo con el
  mismo número que acaba de desmentir y el próximo cliente chocaría con la misma falta. La
  tienda corrige el número al reponer. Contra aceptado: si el cliente pedía 10 y la tienda
  tenía 3, esas 3 quedan escondidas hasta que las cargue.

### Verificación (`_e2e-stock.js`, gitignored)
Ciclo completo contra la API real, **13/13**: crear descuenta (10 → 8), cancelar devuelve
(8 → 10), **cancelar dos veces NO infla** (10 → 10), rechazo por API devuelve, la tienda **no**
puede rechazar por escritura directa, y un producto ilimitado sigue sin el campo `stock`.
Limpia los pedidos que crea y restaura el stock que tocó.
- **Antes de desplegar las reglas, 3 de los 13 fallaban** — justamente los del bypass: la
  tienda escribía `'Rechazado'` directo, la API después rechazaba con "ya está Rechazado" y el
  stock no volvía. Es la misma disciplina de la Fase LL: correr el test antes y después del
  deploy, para que el "✅" signifique algo.
- **Detalle del test que costó encontrar:** `create` valida el horario server-side, así que el
  script tiene que elegir una tienda **sin horario configurado** (`store-hours.ts` las trata
  como siempre abiertas). Elegir cualquier tienda aprobada falla con "La tienda está cerrada".

**Desplegado:** código primero (Vercel), reglas después — la regla nueva bloquea el rechazo
directo, así que al revés el botón de rechazar de producción tiraría `permission-denied` hasta
que Vercel terminara.

**Anotado, no resuelto:** los 7 pedidos muertos que ya tenían stock colgado no se reconciliaron
— son todos del seed y se van con la limpieza pre-lanzamiento. Si algún día hay pedidos reales
en ese estado, hace falta una pasada única que les aplique `returnStockForOrder`.

## Fase NN (ago 2026): reclamos del comprador — cierre del circuito de dinero
Pedido del usuario: "revisemos y finalicemos bien el tema del dinero, también en qué momento
el cliente puede hacer un reclamo; quiero saber cómo manejan toda esa información Rappi o
PedidosYa". Se investigó primero la política oficial de Rappi Argentina y el proceso de
PedidosYa: reclamo estructurado desde el propio pedido (tipo de una lista cerrada + fotos),
revisión humana caso por caso (nunca reembolso automático), reembolso al medio de pago, y
antifraude explícito (rechazan por demora en reportar, dirección mal cargada, info falsa).

**Lo que la auditoría del código encontró antes de diseñar** (agente de exploración, verificado):
el comprador NO tenía NINGÚN camino para reclamar — solo el chat de la orden (que post-entrega
le escribe a la TIENDA, no al admin) y un `mailto:` simulado en `/support`. El reembolso existía
pero desconectado: el admin lo disparaba a mano sin ningún input del comprador. La colección
`refunds` no tenía reglas ni pantalla (mismo agujero que `payment_mismatches` pre-Fase FF y
`admin_audit_log` pre-GG — tercera vez que aparece el patrón). El comprador no veía su reembolso
en ningún lado (solo la notificación). Y `deliveredAt` se escribía en 1 de los 3 caminos que
marcan 'Entregado' — sin reloj confiable no hay ventana de reclamo posible.

**Decisiones de producto del usuario:** ventana de **24h** (no 48 — dudaba entre rubros:
restaurante ≠ mercado, por eso quedó **configurable** en `/admin/settings` →
`config/platform.claimWindowHours`, mismo patrón que deliveryFee); solo reembolso por MP (sin
créditos en la app); foto obligatoria SOLO donde hay algo que fotografiar (mal estado /
producto distinto — "me faltó" y "no llegó" no pueden fotografiar una ausencia); reclamo de
pedido trabado incluido (D2); la tienda NO ve los reclamos (es entre cliente y plataforma,
como Rappi).

**Las piezas:**
- **`deliveredAt` confiable primero**: `updateOrderStatus` (order-service.ts) ahora lo escribe
  al marcar 'Entregado' — cubre los 2 caminos que no lo escribían; la regla del repartidor ya
  permitía el campo. Tipo `Order` ganó `deliveredAt/takenAt/pickedUpAt/updatedAt/hasClaim/
  claimId/refundReason/refundedAt`.
- **`src/lib/claim-types.ts`** — lista cerrada compartida cliente/servidor/admin: `missing_item`
  / `bad_condition` (foto ⭐) / `wrong_item` (foto ⭐) / `not_received` / `stuck_order` / `other`,
  con `itemBased` (selector de ítems → monto sugerido), `requiresPhoto` y `context`
  (delivered|stuck). También `lastMovementMillis()` — "último movimiento" para el umbral de
  trabado (max de createdAt/updatedAt/takenAt/pickedUpAt, porque no hay un updatedAt confiable).
- **`/api/claims/create`** — todo server-side: dueño del pedido, un reclamo por pedido
  (`order.claimId`, chequeado DENTRO de la transacción que crea el claim y marca la orden),
  ventana configurable desde `deliveredAt` (fallback a favor del comprador si falta), foto según
  tipo y SOLO con path propio (`claims/{uid}/...` — nunca un path arbitrario, sería un oráculo
  de firmado), ítems releídos del documento (el body solo manda ids; el monto sugerido se
  calcula acá, nunca del cliente), y `stuck_order` exige pagado + estado activo + >1h sin
  movimiento. **Antifraude denormalizado al crear**: `previousClaims`/`previousRefunded`
  (aggregation counts) — el admin ve "3er reclamo, 2 reembolsados" sin bloqueo automático.
  Rate limit 15/min (los 400 de validación también cuentan — con 5/min el propio e2e se
  auto-bloqueó).
- **`/api/claims/resolve`** — rechazar / otra vía, nota obligatoria (en el rechazo es lo que
  lee el comprador), notifica vía `notifyUser`, auditoría server-side (`resolve_claim`).
  Cualquier nivel de admin (trabajo operativo, no mueve plata).
- **`/api/admin/refund-order` + `claimId`** — la tercera salida: valida que el reclamo sea de
  ese pedido y no esté resuelto, linkea en ambos sentidos (`refunds.claimId` ↔
  `claim.refundId`) y resuelve como `refunded` en la misma request que registra la plata.
- **`/api/claims/photo-url`** — URL firmada 5 min para la evidencia (mismo criterio que
  licencias: disputa ≠ imagen pública; el path SIEMPRE se lee del doc del reclamo). Storage:
  nueva carpeta `claims/{uid}/**` (dueño escribe/lee; admin ve por URL firmada).
- **UI comprador** (`orders/[orderId]/claim-section.tsx`, autocontenido): botón "Reportar un
  problema" en Entregado dentro de la ventana (vencida → texto explicando el plazo, no
  desaparición silenciosa); "¿Problemas con tu pedido?" en pedidos pagados trabados >1h;
  tarjeta con el estado del reclamo (en revisión / rechazado con motivo / resuelto); y
  **tarjeta verde del reembolso** (`refundAmount`/`refundReason`) — antes invisible.
- **`/admin/claims`** — molde de `/admin/incidents` (cursor 25, pestañas por `resolved` en
  memoria) + contador antifraude a la vista + foto + diálogo de reembolso precargado (monto
  sugerido, motivo, comprobante obligatorio). Botón Reembolsar oculto para admin 'support'
  (el server igual lo rechaza). Link "Reclamos de Clientes" en Confianza y Seguridad; tipo
  `claim` en la bandeja del dashboard (ordena debajo de discrepancias de pago, arriba de
  incidentes); etiqueta `resolve_claim` en el Log de Acciones.
- **Reglas**: `claims` (lee admin o el dueño; create/update/delete `false` — todo por API,
  que notifica y audita); **`refunds` por fin con reglas** (lee admin; nada más — registro de
  dinero, ni siquiera 'full' edita/borra); `driver_incidents` acepta `resolutionNote` y los
  incidentes nuevos nacen con `resolved: false` explícito (report-problem y release).

**Verificado — `_e2e-claims.js` (gitignored), 31/31 contra dev server + Firestore real:**
validaciones (sin ítems / sin foto / path ajeno / descripción corta / pedido ajeno / plazo
vencido), reclamo válido con monto sugerido correcto, duplicado bloqueado, notificaciones
(confirmación, motivo del rechazo), stuck (2h pasa, 10min no), reglas con SDK de cliente
(leer lo propio ✅, fabricar/auto-resolverse/leer refunds ❌), doble resolución bloqueada, y el
ciclo completo de reembolso desde reclamo con link bidireccional + comprobante. Login por
**custom tokens del Admin SDK** (`signInWithCustomToken`) — sin adivinar passwords ni chocar
con el rate limit de Auth (lección Fase GG/HH). La limpieza es **por consulta** (busca
`e2eClaims:true` y todo lo que cuelga) y corre también en el catch — el primer run crasheó a
mitad y dejó 5 pedidos huérfanos; por diseño el run siguiente los levanta igual. Cuentas de
seed W (`cliente.multi@`...) **ya no existen** — el e2e usa `cliente@test.com`/`admin@test.com`.

**Reglas + Storage desplegados a producción** ANTES de correr el e2e (las pruebas de reglas
van contra producción; son aditivas, no tocan nada existente). Typecheck y build limpios.

**Anotado, no resuelto:** el chat de la orden post-entrega sigue notificando a la tienda (ok
para coordinar, pero el admin no tiene pantalla para leer `order_chats` — las reglas ya lo
dejan); `refunds` sigue sin pantalla propia (se ve vía el reclamo y el badge del pedido; si
crece, hacer la lista). ~~Conciliación automática con MP~~ — **resuelta en la Fase NN bis**
(abajo).

## Fase NN bis (ago 2026): conciliación automática con MercadoPago
Cerraba el pendiente grande de la Fase KK. **La idea:** el webhook es el único camino por el
que el sistema se entera de un pago, y es un solo disparo — si no llega (MP a veces no lo
manda, Vercel caído en ese segundo) o si DESPUÉS pasa algo sin webhook (devolución desde el
panel de MP, contracargo), la base cuenta una historia distinta que la cuenta de MP y nadie
se entera. La conciliación es la red de seguridad: compara los dos registros en las DOS
direcciones, todos los días.

- **`src/lib/reconcile-mp.ts`** (núcleo compartido):
  - **Dirección A (sistema → MP):** órdenes `paymentStatus=='paid'` de los últimos 30 días
    (cap 300; índice nuevo `orders (paymentStatus, createdAt)`) → `payment.get` a MP por
    cada una. MP dice `refunded/charged_back/cancelled` → marca `payment_reversed` (misma
    rama que el webhook, para cuando el webhook de reversa no llegó) + `paymentStatus:
    'reversed'`. MP dice otra cosa que `approved` (o el pago no existe, 404) → marca
    `reconcile_mismatch`. Nunca "des-marca" una orden pagada por su cuenta.
  - **Dirección B (MP → sistema):** `payment.search` de aprobados de los últimos 7 días
    (`begin_date: 'NOW-7DAYS'`, paginado hasta 200) → busca la orden por
    `external_reference` (que `/api/checkout` ya mandaba con el orderId). Orden inexistente
    → `orphan_payment`. Orden pagada con OTRO paymentId → `duplicate_payment`. Orden sin
    pagar → **el único caso que repara solo: webhook perdido**, con la MISMA validación del
    webhook (monto ±$1 + status 'Pendiente de Pago') marca pagada + notifica tienda/cliente
    (`notifyUser`) + deja `recoveredByReconcile: true` en la orden y una entrada
    `reconcile_repair` en el log de acciones. Cualquier otra combinación → a la bandeja.
  - **Dedupe:** antes de crear una discrepancia consulta si ya hay una ABIERTA del mismo
    pedido+motivo — la conciliación corre a diario y un problema sin resolver no debe
    multiplicarse. Las que crea llevan `source: 'reconcile'`.
  - Cada corrida queda en la colección **`reconciliations`** (cuándo, fuente cron/manual,
    cuántos revisó, reparó, marcó, errores, notas) — sin historial no se sabe si viene
    corriendo o desde cuándo está rota.
- **`/api/cron/reconcile-mp`** — cron de Vercel diario **13:30 UTC, media hora ANTES de la
  liquidación de las 14:00**: el día de liquidación, el cron liquida sobre datos ya
  conciliados. OJO: el plan Hobby de Vercel permite máximo 2 crons — con este quedan
  exactamente 2. Protegido por `CRON_SECRET`, `maxDuration: 60`.
- **`/api/admin/reconcile-mp`** — el botón "Conciliar ahora" en `/admin/payment-issues`.
  Exige admin **'full'** (puede marcar órdenes como pagadas = cambio de estado de plata).
  Rate limit 3 por 5 min (cada corrida le pega a la API de MP pago por pago).
- **UI (`/admin/payment-issues`):** tarjeta arriba con la última corrida (cuándo,
  automática/manual, revisados/reparados/marcados) + botón (oculto para 'support') + las
  notas de la corrida recién disparada. `REASON_LABELS`/`HINTS` nuevos:
  `reconcile_mismatch` ("MP no confirma este pago") y `orphan_payment` ("Pago sin pedido").
- **Reglas:** `reconciliations` solo lectura admin, todo lo demás `false`. Etiqueta
  `reconcile_repair` en el audit-log. **Desplegado a producción** (reglas + índice).
- **Verificado (8/8, script en scratchpad, no en repo):** se plantó una orden "pagada" con
  un `mpPaymentId` inexistente → la conciliación la detectó (`reconcile_mismatch` /
  `not_found`) y marcó la orden; segunda corrida NO duplicó la marca (dedupe); corrida
  final limpia sin errores registrada en `reconciliations`. **Límite honesto de la
  verificación:** no había pagos reales recientes en MP (checkedPayments=0), así que la
  búsqueda quedó probada como integración (corre sin errores contra la API real) pero el
  camino "webhook perdido reparado" con un pago real de verdad no se ejerció — es
  literalmente la misma validación que el webhook ya probado en producción.
- **Trampa de verificación anotada:** la primera corrida del script falló por una consulta
  del PROPIO script (where byUid + orderBy → índice compuesto que la app no necesita) — se
  cambió a filtro en memoria. Y el rate limit de la ruta admin (3/5min) se comparte entre
  corridas del script: reiniciar el dev server lo resetea (vive en memoria del proceso).

## Fase OO (ago 2026): estado de cuenta + ficha 360 del admin
Salió de la pregunta del usuario "¿desde mi cuenta de admin puedo controlar todo de cada una
de las cuentas?". La respuesta era "casi": las fichas mostraban el *estado* de cada cuenta
pero no su *historia completa*. Cuatro huecos verificados en el código y cerrados:
- **Estado de cuenta en las fichas de tienda y repartidor** (cerraba el último pendiente
  grande de Finanzas de la Fase KK). Nuevo componente compartido
  `src/components/account-statement.tsx`: línea de tiempo de TODOS los movimientos de plata
  de la cuenta — cada pedido entregado con su neto (calculado con las MISMAS funciones de
  `money.ts` que aprueban los retiros: `storeNetForOrder`/`driverNetForOrder`; el reembolso
  se muestra como detalle de la fila del pedido, NO como fila aparte — ya está descontado en
  el neto y una fila separada lo restaría dos veces), cada retiro pagado con su comprobante,
  y las solicitudes pendientes/rechazadas como filas informativas (badge, no mueven totales).
  Totales arriba (ganado/pagado/pendiente/saldo o pagado-de-más) + export CSV. Las páginas
  arman los movimientos; el componente solo ordena y muestra — cero fórmulas duplicadas.
- **La ficha de tienda no tenía los retiros** (la de repartidor sí, asimetría heredada) —
  agregada la query `withdrawals (userId==ownerId, userRole=='store')`. Su query de pedidos
  subió de 50 a 200 (misma query alimenta métricas, tabla —que sigue mostrando 50— y estado
  de cuenta; con aviso visible si se toca el tope de 200).
- **Reclamos cruzados por cuenta**: la ficha de tienda lista los reclamos sobre sus pedidos
  (mucho reclamo = problema de calidad del comercio) y la ficha de cliente
  (`user-detail-dialog.tsx`) lista los suyos con el resumen "N reclamos, M con reembolso" +
  badge "Reemb. $X" en su historial de pedidos. Índices nuevos `claims (userId, createdAt)`
  y `claims (storeId, createdAt)` — **desplegados a producción**. La ficha de repartidor NO
  los tiene: `claims` no guarda `driverId` (anotado; si hiciera falta, denormalizarlo al
  crear el reclamo).
- **El chat del pedido ahora es visible para el admin, en SOLO LECTURA**
  (`chat-window.tsx` + condición de render en `orders/[orderId]/page.tsx`): las reglas de
  `order_chats` siempre dejaron leer al admin pero ninguna pantalla lo mostraba — para
  arbitrar un reclamo hay que poder ver qué se dijeron. A propósito NO puede escribir: el
  enrutamiento de notificaciones del hilo solo conoce a los tres participantes, y meter un
  cuarto actor lo rompería en silencio.
- Verificación: typecheck y build limpios; revisión visual pendiente del usuario (las
  fichas renderizan datos existentes con fórmulas ya verificadas en KK/NN).
- **OO bis — "Ganancias de la plataforma"** (`admin/finances/platform-earnings.tsx`, arriba
  de la tabla de retiros en `/admin/finances`): lo que gana la APP en sí — tarifa de
  servicio + comisiones, neto de reembolsos — por período (7d/30d/mes, sin "Todo" por la
  regla de la Fase Z) con comparación vs período anterior (`PctBadge`/`analytics-period`,
  patrón M3: se baja el doble de la ventana en una sola query sobre el índice
  `orders (status, createdAt)` que ya existía). Fórmulas 100% de `money.ts`
  (`platformNetForOrder`; la parte "tarifa" se separa con `serviceFee × (1−refundRatio)` y
  el resto es comisión). `getDocs` one-shot, no listener. Salió de la pregunta del usuario
  "¿dónde veo lo que gana la aplicación?" — antes vivía repartido entre el desglose
  histórico del dashboard y la tarjeta "Comisión plat." de cada ficha de tienda.

## Fase OO ter (ago 2026): historial mensual de ganancias (cierres precalculados)
Pedido del usuario: además del 7d/30d/mes, "poder ver mes a mes y meses anteriores, años".
Ver el histórico NO puede bajar todos los pedidos en cada visita (regla Fases Y/Z) — es la
denormalización que la Fase HH venía anticipando ("un stats/ precalculado cuando toque"):
- **`src/lib/platform-stats.ts`** → colección **`platform_monthly`**, un doc por mes
  calendario (id `"YYYY-MM"`) con ganancia de la app (tarifas + comisiones), reparto (a
  tiendas / a repartidores), facturación y pedidos del mes. Fórmulas de `money.ts`.
  Meses en hora ARGENTINA (UTC-3 fijo — mismo criterio que el día de liquidación, Fase JJ).
- **Mantenido por el cron de conciliación** (`reconcile-mp`, y también el botón "Conciliar
  ahora") — NO hay cron nuevo: Vercel Hobby permite 2 y ya están usados. Cada corrida:
  recalcula los últimos **3 meses cerrados** (un reembolso retroactivo cambia un mes ya
  cerrado; más atrás se considera congelado) y **backfillea** cualquier mes histórico que
  falte (desde el pedido entregado más viejo). El mes EN CURSO nunca se guarda — cambia
  todos los días, la UI lo muestra en vivo con el filtro "Este mes".
- **UI**: sección "Historial mensual" dentro de la tarjeta de Ganancias
  (`platform-earnings.tsx`): tabla mes por mes (pedidos, tarifas, comisiones, ganancia,
  % vs mes anterior con `PctBadge`), leyendo hasta 24 cierres — lecturas mínimas constantes.
- **Regla**: `platform_monthly` solo lectura admin. **Índice nuevo
  `orders (status, createdAt ASC)`** — el DESC de la Fase HH no sirve para el `orderBy`
  ascendente del backfill (misma trampa de dirección exacta que la HH documenta), falló en
  vivo con `failed-precondition` y se detectó porque `updateMonthlyStats` reporta a Sentry
  y loguea. Reglas + índice **desplegados a producción**.
- **Verificado contra la base real**: backfill corrido en vivo → 4 cierres (2026-04 a
  2026-07) con 45 pedidos y $190.745 de ganancia acumulada de la plataforma, consistente
  con el seed. Segunda corrida solo recalcula los 3 recientes (no duplica).
- **Segunda trampa de Firestore encontrada en vivo (la UI mostraba "sin meses" con los
  docs ya creados): `orderBy(documentId(), 'desc')` NO es un índice automático** — el
  ascendente sí, el descendente exige un índice manual sobre `__name__`. Fix: los cierres
  duplican su id en un campo `ym` ("YYYY-MM") y la UI ordena por ese campo (índice de un
  solo campo = automático en ambas direcciones). Los 4 docs existentes se parchearon con
  un script puntual. Regla: para listar "lo más nuevo primero" por id, usar siempre un
  campo espejo, nunca documentId() descendente.
- **Fix de comparación "Este mes" (salió de una captura del usuario: ▼94% falso).**
  `getPeriodBounds('month')` en `analytics-period.ts` devolvía como período anterior el
  mes pasado COMPLETO — a mitad de mes la comparación siempre daba desplome (7 días de
  agosto contra 31 de julio). Ahora compara contra el MISMO TRAMO del mes pasado (1-7 ago
  vs 1-7 jul). Beneficia también a `my-store/analytics` y `delivery/analytics` (ya usaban
  `prevTo`, solo que venía mal calculado). `platform-earnings` además IGNORABA `prevTo`
  al armar el bucket anterior — corregido.
- **Desglose de transacciones por mes** (pedido del usuario): cada fila del historial se
  expande y baja bajo demanda los pedidos entregados de ESE mes (consulta acotada por
  rango sobre el índice `(status, createdAt)`) — fecha, cliente, tienda, venta, ganancia
  de la app por pedido y badge de reembolso, con link al pedido. El mes EN CURSO ahora es
  la primera fila de la tabla (badge "en curso", calculado en vivo, sin % contra el mes
  cerrado anterior — sería el mismo engaño de días parciales).

## Fase OO quater (ago 2026): pasivo real con desglose por cuenta
Pedido del usuario: "el pasivo real tiende a confundir, que muestre datos más detallados".
El panel listaba montos sueltos sin la cuenta que los produce. Ahora:
- **`/api/admin/liability`** manda por fila el desglose completo (`earned`/`paid` además de
  available/pending/debt), la lista dejó de ser top-10 (el título decía "15 tiendas" y la
  lista mostraba 10 — otra confusión) y los sobrepagados viajan con su aritmética completa.
- **`finance-view.tsx`**: leyenda fija de CÓMO se calcula (ganado por pedidos entregados −
  ya pagado por retiros), cada fila muestra "ganó $X · ya cobró $Y · $Z solicitados
  esperando aprobación" con el "se le debe" a la derecha, **cada nombre linkea a su ficha**
  (donde vive el estado de cuenta movimiento por movimiento de la Fase OO), los
  sobrepagados muestran "cobró $X · sus ventas justifican $Y → debe $Z" (con la nota de que
  también pasa por retiros del seed sin ventas — el caso "Pizzería de Prueba debe $8.000"),
  y un total al pie que declara coincidir con la tarjeta.

## Fase PP (ago 2026): auditoría de coherencia total + Tanda 1 de correcciones
Pedido del usuario: "necesito que estemos totalmente seguros... no pueden fallar los números
y no puede fallar nada". Auditoría en 3 frentes con agentes en paralelo + verificación
manual de cada hallazgo clave: (1) coherencia de números (toda pantalla con plata vs
`money.ts`), (2) matriz rol × acción (regla vs API vs UI), (3) mapa de notificaciones.
**Informe completo entregado en PDF** (`Escritorio/Auditoria-EncomiendaYA-Fase-PP.pdf`):
4 críticos, 9 altos, ~14 medios. Veredicto global: la plata que se PAGA está bien (todo lo
que decide pagos usa money.ts); lo que confunde son pantallas informativas pre-KK y avisos
que no llegan. Los hallazgos con archivo:línea están en los informes de los 3 agentes de la
sesión — las Tandas 2-4 (push/avisos, números coherentes, gobernanza admin) quedan
pendientes de ejecutar.

**Tanda 1 ejecutada (los 4 críticos + registro definitivo, verificada 6/6 en vivo):**
- **R1 — el registro de tiendas estaba ROTO en producción**: la regla de `create` de
  `stores` (Fase BB) no incluía `status`, que `createStoreForUser` siempre escribe
  ('Pendiente') → permission-denied en TODO signup de tienda, con la cuenta de Auth creada
  a medias. Invisible porque el alta manual del admin pasa por la rama `isAdmin()`. Fix:
  `status` en la lista + regla `status == 'Pendiente'` en el create no-admin. Verificado
  en vivo con el payload exacto (antes rechazado, ahora pasa; con otro status, bloqueado).
- **Registro definitivo (pedido explícito):** nueva colección **`unique_ids`**
  (id = `dni_XXXXXXXX` / `cuit_XXXXXXXXXXX`) reservada en el MISMO batch que crea la
  cuenta — dos cuentas con el mismo DNI/CUIT imposibles a nivel reglas (create sobre doc
  existente = denegado; verificado en vivo, incluida la suplantación de uid). Pre-chequeo
  con `get` para error claro + rollback `user.delete()` si Firestore falla (adiós cuentas
  a medias — los 2 signups ahora escriben TODO en un batch atómico). Alta de repartidor en
  **2 pasos**: datos + **patente** (obligatoria salvo bicicleta; `vehicle` pasó a objeto
  `{type, plate}`) → **documentos OBLIGATORIOS** para enviar la solicitud (moto/auto:
  licencia frente/dorso + selfie + **cédula del vehículo** `vehicleDocUrl`; bicicleta: DNI
  frente/dorso + selfie), todo por `storeRawPath` a `licenses/{uid}` (URLs firmadas). El
  admin ve la 4ª foto en pending-list y delivery-personnel-list; `/profile` permite
  cargarla a los ya registrados; `/api/licenses/signed-url` firma el campo nuevo;
  `/api/admin/delete-user` **libera los `unique_ids`** al borrar la cuenta (si no, esa
  persona no podría re-registrarse nunca).
- **R2 — segundo camino de tomar pedido sin gates** (`orders/[orderId]`): el botón de
  aceptar aparecía para repartidores NO aprobados (botón que siempre falla) y salteaba el
  tope de 3 pedidos. Ahora exige `isApproved` para verse y cuenta los activos
  (`getCountFromServer`) antes de asignar. `MAX_ACTIVE_ORDERS` movido a `order-service.ts`
  (compartido por los dos caminos).
- **R3 — aprobación unificada.** Nuevo **`src/lib/approval-service.ts`**
  (`setAccountApproval`): users.isApproved + users.status + stores.isApproved SIEMPRE
  juntos en un batch, auditado, y **la persona SE ENTERA** (F3: aprobar era silencioso).
  Reemplaza los 5 caminos (dashboard, gestión repartidores, ficha repartidor —usa
  'Inactivo' al desactivar—, ficha tienda, diálogo de gestión tiendas — este además dejó
  de escribir la aprobación por su cuenta y solo llama al servicio si cambió). La cola de
  solicitudes y los badges del sidebar filtran `status !== 'Rechazado'` (los rechazados
  quedaban en la cola PARA SIEMPRE: isApproved:false es justo el filtro).
- **R4 — `/checkout` muerto eliminado** (creaba el pedido y lo mandaba a pagar salteando
  la confirmación de stock; sin ningún link desde la Fase V) y **`/api/checkout` ahora
  exige `status == 'Pendiente de Pago'`** y rechaza pedidos ya pagados — antes generaba
  links de pago para pedidos cancelados/rechazados/pagados.
- De paso (del mapa de notificaciones): `sendNotification` ya no puede perder una
  notificación por `orderId: undefined` (el SDK lanza con undefined) y el push loguea las
  respuestas HTTP de error (antes un 401 se perdía sin rastro).
- Reglas desplegadas ANTES de verificar; typecheck y build limpios.

**Registro final según especificación del usuario (2ª pasada, misma fase):**
- **Cliente**: nombre y apellido (label + mínimo 5), email único (Auth), **teléfono ÚNICO**
  (`tel_XXXXXXXXXX` en `unique_ids`, batch atómico + rollback).
- **Tienda**: + **DNI del dueño** (obligatorio y único) y **teléfono único** — reserva
  cuit + dni + tel en el mismo batch. `users` del dueño guarda `dni`.
- **Repartidor**: + **CUIT/CUIL** (obligatorio, se guarda `cuil` normalizado — necesario
  para pagarle en regla) y **teléfono único**; el paso 2 de documentos ahora exige también
  el **SEGURO del vehículo vigente** (`vehicleInsuranceUrl`) para moto/auto (5 fotos:
  licencia frente/dorso + selfie + cédula + seguro; bicicleta sigue con 3 de DNI).
- Helper compartido `src/lib/unique-ids.ts` (uniqueRef/uniquePayload/isTaken/digitsOnly);
  reglas: `cuil` en el create de users, `vehicleInsuranceUrl` editable por el dueño;
  `/api/licenses/signed-url` firma los 5 campos; pending-list, gestión de repartidores y
  `/profile` muestran/cargan los 2 documentos nuevos. Verificado en vivo (tel único 2/2).
- **Anotado**: la reserva de teléfono es AL REGISTRARSE — editar el teléfono en /profile
  no re-chequea unicidad (ciclo de vida completo = pieza aparte, si algún día hace falta).

**Tanda 2 ejecutada (push y avisos — los hallazgos F del mapa de notificaciones):**
- **F2 — el service worker leía el link por una ruta inexistente** (`payload.webpush?...`
  no existe en el payload del cliente; es `payload.fcmOptions.link`) → todos los push sin
  `data.url` abrían la home. Corregido + el "enfocar pestaña abierta" comparaba URL
  absoluta contra path relativo (nunca acertaba; ahora navega la pestaña existente).
  `notifyUser` ahora manda `data.url` además de `fcmOptions.link`.
- **F1 — el aviso más urgente del sistema no sonaba**: `notify-drivers` y el re-broadcast
  de `release` eran SOLO campanita (repartidor con la app cerrada no se enteraba nunca).
  Ahora multicast FCM real a aprobados y disponibles, link a `/orders`.
- **F4 — avisos ausentes del ciclo**: 'Listo para recoger' no avisaba a NADIE (case
  comentado en `updateOrderStatus`) → avisa al comprador; cancelar con repartidor asignado
  → aviso al repartidor (`cancel`); soltar → aviso al COMPRADOR (`release`);
  `report-problem` decía "el admin fue avisado" SIN ningún aviso → notifica a todos los
  `roles_admin`; retirar/entregar → aviso a la TIENDA (delivery-orders-view).
- **F5 — campanitas muertas** (sin link, tocarlas no navegaba): liquidaciones del cron
  (la rama repartidor además sin push), reseñas de tienda y repartidor → `notifyUser` con
  link; broadcast del admin con `link:'/'` y `data.url`.
- **F6 — chat-listener**: + 'Listo para recoger' y 'En camino' (la ventana del chat
  comprador↔repartidor no sonaba). 'Entregado' NO a propósito (listener por cada pedido
  histórico = sin techo; post-entrega llega por campanita). **Fuga corregida**: cada
  `modified` apilaba otro listener sin desuscribir (sonido N veces por mensaje) — ahora
  registro de unsubs + cleanup completo.
- Typecheck y build limpios. FCM real se prueba con dispositivos en la gran prueba.

**Tanda 3 ejecutada (números coherentes — los hallazgos N del frente 1):**
- **N7 (raíz):** `confirm-stock` ahora recalcula `commissionAmount` al sacar ítems — era
  el único campo de plata que quedaba obsoleto (el desglose del dashboard lo suma tal cual).
- **N1:** el desglose "Facturado" del dashboard admin quedó rotulado **BRUTO** explícito
  (las aggregations no pueden aplicar money.ts) con link "Ver la ganancia neta real en
  Finanzas →" — se acabaron las dos pantallas contándose distinto sin decir cuál manda.
- **N13:** tabla "Por tienda" (comisión ahora neta: reembolsos + efectivo) y "Por
  repartidor" (`driverNetForOrder` en vez de envío crudo) del dashboard; header "Ventas"
  → "Ventas brutas".
- **N2:** `my-store` "Ventas de hoy" calculaba `total − envío` (= le atribuía a la tienda
  la TARIFA DE SERVICIO de la plataforma, sin comisión/reembolsos/efectivo — el error que
  money.ts documenta como corregido, sobrevivía en el dashboard). Ahora
  `storeNetForOrder` con el default de config, rotulada **"Tuyo de hoy (neto)"** —
  coincide con la billetera a la que enlaza.
- **N3/N4/N5:** "Ganancias de hoy" del repartidor, las filas del historial de
  `/delivery/earnings` (no sumaban el titular de su propia pantalla, + formato es-AR) y
  la columna "Ganó" de la ficha admin — todo a `driverNetForOrder`.
- **N6:** la ficha de tienda del admin dejó el 10% hardcodeado y lee
  `config/platform.defaultCommissionRate` (como payout-service/wallet); el header muestra
  "X% (default)" en vez de "0%" para tiendas sin tarifa propia.
- **N8:** "Movimientos" de analytics de tienda ya no pinta pedidos CANCELADOS como
  "+$X" en verde (solo entregados llevan + y verde).
- **N9:** analytics del repartidor — la query filtraba por CREACIÓN y los buckets agrupan
  por ENTREGA: pedidos "a caballo" del corte no se bajaban y faltaba plata. Buffer de 7
  días en la query (el filtro real por deliveredAt lo hace computeStats).
- **N10:** asimetría de fecha documentada al usuario en ambas analíticas ("por fecha del
  pedido" tienda/admin vs "por fecha de entrega" repartidor).
- **N11:** "Gastado" de la ficha de cliente: neto de reembolsos + rotulado "últ. 30".
- **N12:** CSV de pedidos exporta Subtotal/Comisión %/Comisión $/Reembolsado (antes no se
  podía reconciliar ningún neto); CSV de tiendas dice "default" en vez de "0" de comisión.
- Typecheck y build limpios.

**Tanda 4 ejecutada (gobernanza admin — los hallazgos P) → FASE PP COMPLETA:**
- **P1 (reglas + UI):** nuevo helper `isMoneyFieldChange()` en firestore.rules — un admin
  'support' ya NO puede tocar `commissionRate` ni `payoutCbu` (ni en `stores` ni en
  `users`) ni **borrar tiendas** (`stores delete: isFullAdmin()` — borrar una tienda hace
  desaparecer su saldo del pasivo). UI: inputs de CBU deshabilitados con explicación en
  ambas fichas, botón Eliminar oculto en Gestión Tiendas, y el diálogo de edición excluye
  `commissionRate` del update para support (si no, TODO el guardado fallaría).
- **P2:** botón "Reembolsar" de Gestión Pedidos oculto para 'support' (el server ya daba
  403; era el último botón-que-siempre-falla).
- **P3:** `isAdminRoleChange()` ahora cubre CUALQUIER cambio de `role` (antes solo
  hacia/desde admin — un 'support' podía convertir compradores en tiendas/repartidores);
  `handleRoleChange` exige full para todo cambio de rol.
- **P4:** rol/nivel de admin se escriben en **batch atómico** (users + roles_admin juntos;
  antes dos writes sueltos podían dejar un "admin" fantasma).
- **P5:** `delete-review` era la única ruta admin sin rate limit → 20/min + `verifyAdmin`
  helper (sigue disponible para 'support': moderar es tarea operativa).
- **P6:** "Avisar repartidor" desde el detalle del pedido ahora escribe también
  `lastDriverNotification` (el otro camino ya lo hacía — dato desparejo).
- **P7:** borrados los componentes muertos `stores/[storeId]/product-list.tsx` y
  `manage-item-dialog.tsx` (segundo camino de edición de productos sin ningún import).
- **Verificado en vivo 9/9** (ataque + regresión en la MISMA corrida, disciplina LL):
  admin bajado temporalmente a 'support' con SDK de cliente → comisión/CBU tienda/CBU
  usuario/borrar tienda/cambiar rol TODOS bloqueados; pausar tienda y aprobar cuentas
  SIGUEN funcionando; nivel y datos restaurados con lectura fresca. Tienda TEMPORAL para
  el test de borrado (jamás intentar borrar una real). Reglas desplegadas antes de
  verificar; typecheck y build limpios.

## Fase QQ (ago 2026): pasada visual/UX del comprador — primera tanda
Método de las Fases Q/AA: mirar la app CORRIENDO, no el código — recorrido completo del
flujo comprador con Playwright a 430px (login → home → tienda → producto → carrito →
checkout → pedidos → detalle entregado → favoritos → perfil), capturas revisadas una por
una. Veredicto general: el rediseño AA envejeció bien (home/tienda/favoritos/checkout se
ven sólidos, 0 overflow horizontal). Corregido lo encontrado:
- **Login: pestaña "Modo Prueba" ELIMINADA** (ítem pre-lanzamiento adelantado): exponía
  cuentas/contraseñas demo a cualquier visitante y su fetch fallaba con permission-denied
  en la consola de todos los anónimos.
- **Detalle del pedido: "Empanadas del VallePedido a"** — texto pegado y al revés en la
  CardDescription; y para la tienda decía "para **nombre**" con asteriscos literales.
  Reescrito ("Pedido a X" / "Pedido de X").
- **Detalle del pedido: montos "$34000.00"** (toFixed(2), sin miles y con el punto donde
  va la coma) → formato es-AR sin decimales en ítems, subtotal/envío/tarifa/total y las
  dos vistas del repartidor ("+$2.000" oferta, "Ganaste $2.000").
- **Perfil: el botón "Cambiar Foto" PISABA el badge de rol** (absolute sobre el avatar en
  celular) → el badge ahora vive junto al nombre.
- **Rubros crudos** ("comida-rapida") en migas, chips de la tienda, títulos de sección,
  "Más de {rubro}", chips del home y tarjeta de tienda → nuevo
  `formatCategoryLabel()` en `category-style.ts` (mapa con acentos para los conocidos +
  fallback guiones→espacios Capitalizado).
- **Tarjetas de "Mis Pedidos": borde izquierdo por PAGO, no por estado** — un pedido
  cancelado que estuvo pagado quedaba verde. Ahora el borde sigue el color semántico del
  estado (`getOrderStatusKind`).
- **Hallazgo de config, no de código:** `config/platform.claimWindowHours` estaba en **3**
  (¿prueba del usuario en Ajustes?) — lo acordado fue 24. Avisado; se cambia en /admin/
  settings, no se tocó por código.
- Verificación: re-capturas post-fix (login sin errores de consola, perfil sin overlap,
  labels legibles); typecheck y build limpios. **Pendiente de la pasada visual:** flujos
  de tienda/repartidor/admin en celular, y el checkout con dirección guardada (la cuenta
  de prueba no tenía direcciones — se vio el camino "GPS obligatorio", correcto por
  diseño). Playwright quedó como devDependency del repo.

## 🔒 PRINCIPIO DE PRODUCTO — el dinero nunca sale solo (decisión del usuario, ago 2026)
**Ninguna plata sale de la plataforma sin que el admin analice y apruebe ese caso
particular.** Vale para todo lo existente (retiros, reembolsos) y para todo lo futuro —
en particular, la **devolución por API de MP** (anotada para el bloque de MP
pre-lanzamiento): la API solo EJECUTA la devolución que el admin ya aprobó en el diálogo
de reembolso (reemplaza el paso manual del panel de MP), jamás se dispara sola. Lo único
automático permitido es (a) generar SOLICITUDES para aprobar (cron de liquidación) y
(b) registrar plata que ENTRA (webhook/conciliación marcando pagos aprobados en MP).

## Pendientes pre-lanzamiento
- **Agregar `NEXT_PUBLIC_SENTRY_DSN` a las env vars de Vercel** (Settings → Environment
  Variables, Production+Preview+Development) — hoy Sentry solo captura en local
  (`.env.local`); sin esto en Vercel, producción no manda errores a Sentry. Recordatorio
  explícito pedido por el usuario: avisarle antes del lanzamiento si todavía no se hizo.
- Revisar/resolver la firma del webhook de MP (ver caveat) y volver a exigirla
- Regenerar el `MP_WEBHOOK_SECRET` (quedó expuesto durante pruebas)
- **Devolución por API de MP** (`POST /v1/payments/{id}/refunds`, el `mpPaymentId` ya se
  guarda): implementar JUNTO con lo de arriba (mismas credenciales, y probarlo requiere un
  pago real chico + su devolución). Respetar el principio de "el dinero nunca sale solo":
  la API solo ejecuta lo que el admin aprobó en el diálogo, caso por caso.
- Sacar la tabla de cuentas demo visible en `/login` (sirve para pruebas, no para producción)
- Limpiar datos de prueba (órdenes/notificaciones, reseñas `Cliente de Prueba N` en
  "DonalPizza" de la Fase Q, **el seed masivo de la Fase W**, y **el seed de QA de la Fase
  HH**: 15 tiendas + 100 pedidos marcados con `seedBatch: 'QA-GG'`, borrables de una con
  `node _seed-qa.js --undo`) antes de abrir a usuarios reales
## Fase BB (ago 2026): reglas de Firestore restringidas por campo (users/stores)
Cerraba el hallazgo anotado desde la Fase U: cualquier usuario logueado podía reescribir
**cualquier** campo de su propio doc en `users/{uid}` (incluido `isApproved`, `role`, `rating`),
y lo mismo el dueño de una tienda sobre `stores/{storeId}`. Un repartidor podía auto-aprobarse
desde la consola del navegador y salir a repartir sin pasar nunca por el admin; una tienda podía
inflar su propio `rating` sin una reseña real, o auto-aprobarse.
- **Inventario exhaustivo primero** (agente de exploración sobre TODO el código cliente, no de
  memoria): 21 puntos de escritura reales a `users`/`stores` mapeados uno por uno (los 3
  signup, `/profile`, toggles de disponibilidad/pausa, CBU, favoritos, panel admin), con la
  lista exacta de campos que cada camino escribe.
- **`firestore.rules`**: `create` y `update` de `users/{uid}` y `stores/{storeId}` ahora exigen
  `affectedKeys().hasOnly([...])` con la lista de campos que ese camino de verdad necesita. El
  propio usuario/dueño nunca puede tocar `isApproved`/`role`/`status`/`rating`/`ratingCount`
  desde su propio update; el admin sigue con acceso total (bypass explícito). El `create` valida
  además `isApproved != true` (nadie nace ya aprobado) y, en `users`, `role in ['buyer','store','delivery']`
  (nadie se autocrea como admin).
- **Bug propio encontrado y corregido antes de desplegar:** las reglas de `create` usaban
  `request.resource.data.diff(resource.data)` — pero en un `create`, `resource` (el doc anterior)
  **no existe todavía**; eso habría roto el alta de cuentas y tiendas por completo. Se corrigió a
  `request.resource.data.keys().hasOnly([...])`, que no depende del doc previo.
- **Verificado contra producción real, con el SDK de CLIENTE** (no Admin, que bypasea las
  reglas) usando las 4 cuentas de test + un signup real de punta a punta (buyer y store,
  creados y borrados en la corrida): registro/edición de perfil, toggle de disponibilidad,
  pausa manual, CBU, `maxDiscountPercent` — todos permitidos. Los ataques (auto-aprobarse,
  autopromoverse a admin, inflar rating, crear una tienda ya-aprobada) — todos bloqueados con
  `permission-denied`, confirmado por dos vías independientes (rechazo del SDK + lectura con
  Admin SDK del valor persistido real).
  **Nota de método:** la primera pasada de verificación dio falsos positivos porque
  `updateDoc()` en Node resuelve de forma optimista (local) antes de que el servidor confirme
  el permiso, y las cuentas de prueba usadas ya estaban aprobadas de antes (memoria
  desactualizada — recordatorio de por qué siempre hay que verificar contra el estado real, no
  asumir). Se resolvió separando ataque y verificación en procesos distintos y leyendo la
  verdad con Admin SDK.
- **Efecto colateral de la verificación (documentado, no un bug):** para probar el bloqueo
  con un estado inicial conocido, `repartidor.pendiente@test.com` y `stores/Boutique Lu`
  quedaron reseteados a `isApproved:false` — coincide con el estado que la Fase W les había
  asignado originalmente (estaban aprobados manualmente en algún momento posterior, sin
  quedar registrado en ningún lado).
- **`notifications` (Firestore) — cerrado en una segunda pasada.** El `create` sigue abierto a
  cualquier logueado a propósito (es una función real: la tienda avisa al repartidor, el chat
  de la orden, etc. — restringir a "solo para mí mismo" la rompería). Se le agregó validación
  de forma: `affectedKeys().hasOnly([...])` con los campos exactos que
  `src/lib/order-service.ts`/`chat-window.tsx` realmente escriben, y `type` restringido a una
  lista cerrada de 5 valores reales (`order_status`, `delivery`, `buyer`, `store`, `admin`).
  Sube la vara contra spam/payloads inyectados sin tocar la función legítima. Nota: esto NO es
  rate-limiting real (Firestore Rules no lo puede hacer) — eso necesitaría App Check, queda
  para cuando se abra esa puerta.
- **Storage (`profiles`/`store-banners`/`products`) — cerrado, con un hallazgo importante en
  el camino.** Antes cualquier logueado podía pisar la imagen de OTRO usuario/tienda (el path
  no validaba dueño). `src/components/image-upload.tsx` arma el path como
  `{folder}/{ownerId}/archivo`. **Hallazgo: `firestore.get()`/`firestore.exists()` (lectura
  cruzada a Firestore desde Storage Rules) NO funciona de forma confiable en este proyecto** —
  se probó en vivo contra producción y falló incluso para `isAdmin()` (que ya existía antes de
  esta fase, con datos verificados correctos). Por eso `store-banners`/`products` NO se
  arreglaron con un `isStoreOwner(storeId)` vía Firestore (el intento inicial), sino cambiando
  la convención de esas dos carpetas para usar el **uid del dueño** en vez del `storeId` —
  mismo patrón simple y ya probado que usan `profiles`/`licenses`
  (`request.auth.uid == uid`), sin ningún lookup cruzado. Se actualizó `ownerId` en
  `my-store/edit/page.tsx` y `my-store/products/page.tsx` de `userProfile.storeId` a
  `user.uid` — no rompe nada porque en esas dos pantallas quien sube SIEMPRE es el dueño
  autenticado. Las imágenes viejas subidas con el path anterior (`{folder}/{storeId}/...`)
  siguen siendo legibles (`read: if true`, sin cambios) — solo cambia dónde aterrizan las
  subidas nuevas.
  **Hallazgo colateral — resuelto en la misma fase, con un fix más de fondo.** Al investigar
  por qué `isAdmin()` fallaba en Storage Rules, se encontró algo peor: el panel admin mostraba
  la foto del carnet vía `<img src={licenseUrl}>`, donde `licenseUrl` es una URL de descarga de
  Firebase con un **token de acceso permanente incrustado** (`?alt=media&token=...`). Esa URL
  sirve el archivo para siempre a CUALQUIERA que la tenga — sin login, sin pasar nunca por
  Storage Rules (Firebase resuelve el token antes de mirar las reglas) — para un documento de
  identidad (DNI/carnet) es un riesgo real de exposición permanente, no solo un bug de reglas.
  - **`src/components/image-upload.tsx`**: nueva prop `storeRawPath` — para archivos sensibles,
    en vez de devolver la URL con token, devuelve solo el PATH del archivo.
  - **`src/app/my-store/edit/page.tsx` y `my-store/products/page.tsx`**: de paso, se cambió
    `ownerId` de `userProfile.storeId` a `user.uid` (ver arriba) — nada que ver con licencias,
    fue el fix de `firestore.get()` roto.
  - **Nueva `src/app/api/licenses/signed-url/route.ts`** (Admin SDK, rate-limited): dado un
    `uid`, devuelve URLs de acceso de **5 minutos** para las 3 fotos de licencia. Solo el propio
    usuario o un admin pueden pedirlo (nunca un path arbitrario — siempre lee el path guardado
    en Firestore, para no abrir un oráculo de firmado de cualquier archivo del bucket). Como usa
    Admin SDK, bypasea Storage Rules por completo — el `isAdmin()` roto deja de importar para
    este flujo real.
  - **`profile/page.tsx`, `admin/pending-list.tsx`, `admin/delivery/delivery-personnel-list.tsx`**:
    los 3 lugares que muestran el carnet ahora piden la URL firmada a la API en vez de leer
    `licenseUrl` directo. Compat con datos viejos: si el valor guardado ya es una URL completa
    (`http...`, de antes de este fix), la API la devuelve tal cual sin firmar nada nuevo.
  - **Verificado contra producción real**: dueño ve sus propias fotos (200), admin ve las de
    otro usuario (200), un comprador cualquiera intenta ver las de otro (403 bloqueado); y una
    subida nueva simulada (path puro, sin token) devuelve una URL firmada real de GCS
    (`Expires=...&Signature=...`) que efectivamente sirve la imagen (200, `image/png`).
  - `storage.rules`: el comentario de `licenses/{uid}` se actualizó para dejar claro que la app
    ya no depende de esa regla para leer (todo pasa por la API con Admin SDK); se deja la regla
    como está por si algún día se lee directo desde el cliente, pero el `isAdmin()` de ahí sigue
    roto y de bajo impacto real ahora.
- **Regla general para el futuro**: en `storage.rules`, nunca condicionar un `allow` a un
  `firestore.get()`/`firestore.exists()` sin probarlo en vivo primero — puede compilar
  perfecto y fallar en runtime. Y para cualquier documento sensible (DNI, carnet, comprobantes):
  nunca guardar la URL de descarga con token en Firestore — guardar el path y servir siempre por
  una URL firmada de corta duración vía una API con Admin SDK.

**`npm audit` (mismo bloque de seguridad):** de 33 vulnerabilidades a 14 — `next` pasó de
14.2.5 a **14.2.35** (mismo mayor, sin breaking changes; `npm audit fix` no lo agarraba solo,
se instaló explícito) y eso eliminó el ÚNICO crítico y bajó varios altos. Verificado:
typecheck+lint limpios, dev server arranca en 14.2.35, y home/login/tienda responden 200.
**Quedan 14, todas detrás de un salto de versión MAYOR, dejadas afuera a propósito:**
`eslint-config-next`/`@next/eslint-plugin-next`/`glob` (solo lint, dev-only, cero riesgo
real); `firebase-admin` (12→14) y `mercadopago` (2→3) y sus transitivos
(`@google-cloud/firestore`, `google-gax`, `teeny-request`, `retry-request`, `uuid`) — son
dependencias de producción críticas (Admin SDK y pagos); forzar el mayor sin una pasada
dedicada de pruebas es más riesgoso que las CVEs moderadas que arregla. Un "alto" residual en
`next`/`postcss` también requiere saltar a Next 16 (fuera de alcance, App Router cambió mucho
entre 14→15→16).

## Fase W (jul 2026): datos de prueba masivos para QA manual pre-lanzamiento
Antes de la revisión final de seguridad, se pobló la base real (`studio-354048519-4bc1e`)
con variedad de datos para poder navegar y controlar cada caso a mano. Corrido con dos
scripts puntuales (Admin SDK, no quedaron en el repo — no se tocó `/api/dev/seed`, que
sigue siendo el seeder liviano de siempre). Password de **todas** las cuentas nuevas:
`Test1234!`. No se tocó ninguna cuenta/tienda ya existente.
- **4 tiendas nuevas**, una por rubro no cubierto todavía: Farmacia San Martín
  (horario con siesta, dueño `farmacia@test.com`), Supermercado El Sol (horario normal,
  `super@test.com`), Kiosco 24hs Don Beto (abierto 24hs, `kiosco@test.com`), Boutique Lu
  (**pendiente de aprobación** + cerrada hoy a propósito, `ropa@test.com`) — para poder
  probar el flujo de aprobación de tiendas de punta a punta.
- **3 repartidores nuevos** cubriendo cada estado de aprobación:
  `repartidor.pendiente@test.com` (Pendiente, con fotos de licencia placeholder),
  `repartidor.rechazado@test.com` (Rechazado), `repartidor.offline@test.com` (Activo y
  aprobado, pero `isOnline: false` — para probar que no recibe broadcasts de pedidos).
- **3 compradores nuevos** cubriendo cada caso de dirección del checkout:
  `cliente.nueva@test.com` (sin ninguna dirección guardada), `cliente.singps@test.com`
  (una dirección guardada SIN GPS), `cliente.multi@test.com` (dos direcciones, ambas con
  GPS) — para probar los 3 caminos del selector de dirección de `CheckoutDialog`.
- **~25 productos nuevos**: stock bajo, agotados (por `available:false` y por
  `stock:0`), en oferta (`discountPercent`, dispara el badge del home), y productos
  "Combos". Incluye 3 productos extra agregados a DonalPizza y Pizzería de Prueba.
- **18 pedidos en total** cubriendo *todos* los estados reales del flujo: Pendiente de
  Confirmación, Pendiente de Pago, Listo para recoger (sin repartidor, en el pool), En
  camino (asignado, sin retirar — sirve para probar "Soltar pedido"), En reparto (con
  `driverCoords` para el mapa en vivo, y `hasReportedProblem: true` para probar el aviso
  de "Reportar problema"), y 6 Entregados repartidos en distintos días/horas (para que
  los gráficos de analíticas de tienda y repartidor tengan datos) con combinaciones de
  reseña ya hecha / pendiente en ambos lados (tienda y repartidor).
- **Reseñas, retiros, incidentes**: reseñas de tienda y de repartidor (con los
  promedios `rating`/`ratingSum`/`ratingCount` actualizados a mano para que cuadren),
  4 retiros nuevos (pending/approved/rejected, manual y automático), 2
  `driver_incidents` (uno `released`, uno `problem_reported`) para que la alerta del
  dashboard de admin tenga contenido real.
- `config/platform` completado con `deliveryFee`/`settlementDayOfWeek` explícitos.

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
