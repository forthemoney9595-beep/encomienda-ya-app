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

## Pendientes pre-lanzamiento
- Revisar/resolver la firma del webhook de MP (ver caveat) y volver a exigirla
- Regenerar el `MP_WEBHOOK_SECRET` (quedó expuesto durante pruebas)
- Sacar la tabla de cuentas demo visible en `/login` (sirve para pruebas, no para producción)
- Limpiar datos de prueba (órdenes/notificaciones, reseñas `Cliente de Prueba N` en
  "DonalPizza" de la Fase Q, **y todo el seed masivo de la Fase W** — ver abajo) antes de
  abrir a usuarios reales
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
