# 🛡️ Auditoría Exhaustiva Pre-Producción — EncomiendaYA

**Protocolo:** PRE_RELEASE_AUDIT_PROMPT.md (35 fases, evidencia obligatoria)
**Alcance:** completa y exhaustiva · **Modo:** solo auditar y documentar (sin tocar código)
**Inicio:** 19/8/2026 · **Auditor:** Claude (fleet de agentes + verificación personal)
**Regla de oro:** nada es `PASS` sin evidencia; lo dudoso es `NOT_VERIFIED`, nunca `PASS`.

---

## FASE 0 — Descubrimiento

- **Stack:** Next.js 14 (App Router) · Firebase (Firestore/Auth/FCM/Storage) · MercadoPago · Vercel (Hobby, 2 crons máx) · Tailwind + shadcn · Leaflet.
- **Proyecto Firebase:** `studio-354048519-4bc1e`. Deploy: push a `main` → Vercel auto-deploy; reglas por `firebase deploy --only firestore:rules`.
- **Levantar/verificar:** `npm run dev` · `/verificar` (skill: tsc + next lint 0 errores + build completo).
- **Auditorías previas relevantes** (evidencia ya documentada en CLAUDE.md, se re-verifican los caminos críticos, no se re-hacen a ciegas): K/L (auth por token), BB (reglas por campo), TT (seguridad total), KK (sistema de dinero, con scripts `_attack-money.js`/`_audit-money.js`/`_e2e-payout.js`), UU (privacidad), SS (archivo por archivo), PP (coherencia).

## FASE 1-2 — Mapa del sistema

- **Roles reales (4):** `buyer` · `store` · `delivery` · `admin`. El rol admin real lo decide `roles_admin/{uid}` (no `users.role`), con niveles `full`/`support` (`roles_admin/{uid}.level`).
- **24 colecciones Firestore:** users, stores (+ subcol products/items/secure), orders (+ secure/pin), order_chats, favorites, notifications, reviews, deliveryReviews, claims, refunds, withdrawals, driver_incidents, payment_mismatches, reconciliations, platform_monthly, admin_audit_log, broadcasts, roles_admin, unique_ids, config.
- **Reglas:** firestore.rules (507 líneas) + storage.rules (74). Índices: 56 campos en firestore.indexes.json.
- **Piezas centrales de lógica:** `money.ts` (reparto puro, única fuente), `payout-service.ts` (saldos), `notify-server.ts` (avisos), `auth-server.ts` (verifyAuthToken/verifyStoreOwnership/verifyFullAdmin), `stock-service.ts`, `reconcile-mp.ts`, `store-hours.ts`, `unique-ids.ts`, `approval-service.ts`, `driver-broadcast.ts`, `admin-audit-server.ts`.

## FASE 7 — Inventario de RUTAS API (33) + postura de seguridad

| ID | Ruta | tok | adm | cron | rl | Nota inicial |
|---|---|---|---|---|---|---|
| API-001 | /admin/approve-test-payment | ✓ | full | — | ✓ | 🧪 TEMPORAL — sacar antes de lanzar |
| API-002 | /admin/approve-withdrawal | ✓ | full | — | ✓ | |
| API-003 | /admin/delete-review | ✓ | ✓ | — | ✓ | |
| API-004 | /admin/delete-user | ✓ | full | — | ✓ | |
| API-005 | /admin/email-verified | ✓ | ✓ | — | ✓ | |
| API-006 | /admin/liability | ✓ | ✓ | — | ✓ | |
| API-007 | /admin/notify-broadcast | ✓ | full | — | ✓ | |
| API-008 | /admin/reconcile-mp | ✓ | full | — | ✓ | |
| API-009 | /admin/refund-order | ✓ | full | — | ✓ | |
| API-010 | /admin/reject-withdrawal | ✓ | ✓ | — | ✓ | |
| API-011 | /checkout | ✓ | — | — | ✓ | exige Pendiente de Pago |
| API-012 | /claims/create | ✓ | — | — | ✓ | |
| API-013 | /claims/photo-url | ✓ | ✓ | — | ✓ | URL firmada |
| API-014 | /claims/resolve | ✓ | ✓ | — | ✓ | |
| API-015 | /cron/generate-settlements | — | — | ✓ | — | fail-closed a verificar |
| API-016 | /cron/reconcile-mp | — | — | ✓ | — | fail-closed a verificar |
| API-017 | /delivery-reviews/create | ✓ | — | — | ✓ | |
| API-018 | /dev/seed | — | — | — | — | bloqueado por NODE_ENV (verificar) |
| API-019 | /licenses/signed-url | ✓ | ✓ | — | ✓ | |
| API-020 | /notify | ✓ | — | — | ✓ | |
| API-021 | /orders/cancel | ✓ | ✓ | — | ✓ | |
| API-022 | /orders/confirm-delivery | ✓ | — | — | ✓ | PIN 19/8 |
| API-023 | /orders/confirm-payment | — | — | — | — | 410 muerto (verificar) |
| API-024 | /orders/confirm-stock | ✓ | — | — | ✓ | |
| API-025 | /orders/create | ✓ | — | — | ✓ | genera PIN + stock en tx |
| API-026 | /orders/notify-drivers | ✓ | — | — | ✓ | |
| API-027 | /orders/reject | ✓ | — | — | ✓ | devuelve stock |
| API-028 | /orders/release | ✓ | — | — | ✓ | |
| API-029 | /orders/report-problem | ✓ | ✓ | — | ✓ | |
| API-030 | /reviews/create | ✓ | — | — | ✓ | |
| API-031 | /signup/check-unique | — | — | — | ✓ | pre-registro, solo booleano |
| API-032 | /webhooks/mercadopago | — | — | — | ✓ | valida re-consultando a MP |
| API-033 | /withdrawals/request | ✓ | — | — | ✓ | valida saldo server-side |

## FASE 3 — Inventario de PÁGINAS (43)

Invitado: `/` `/login` `/signup` `/signup/{buyer,delivery,store}` `/forgot-password` `/stores/[id]` `/terms` `/privacy` `/support`.
Cliente: `/` `/favorites` `/orders` `/orders/[id]` `/profile` `/my-purchases`.
Tienda: `/my-store` `/my-store/{edit,products,categories,reviews,wallet,analytics}`.
Repartidor: `/delivery` `/delivery/{analytics,earnings,reviews}` `/orders`.
Admin (con guard): `/admin` + `/admin/{dashboard,users,orders,stores,stores/[id],delivery,delivery/[id],finances,claims,payment-issues,incidents,reviews,communications,audit-log,settings}`.

---

## HALLAZGOS (se completa con los agentes + verificación personal)

_Formato por hallazgo: ID · Severidad · Categoría · Estado · Ubicación (file:line) · Problema · Evidencia · Impacto · Reproducción · Causa raíz · Solución · Test recomendado._

### Frente RUTAS + APIs — CERRADO (verificado personalmente contra el código)
Veredicto del frente: capa de seguridad **madura**. 0 CRITICAL, 0 HIGH. Las 4 rutas de plata (withdrawals/request, approve/reject-withdrawal, refund-order) blindadas con token + verifyFullAdmin + transacción + comprobante. Crons fail-closed. dev/seed bloqueado en prod. confirm-payment = 410.

- **API-034 · MEDIUM · Rate-limit evadible + in-memory** · CONFIRMADO · `src/lib/rate-limit.ts:35` — `getClientIp` toma `x-forwarded-for.split(',')[0]` (el valor más a la izquierda es el que manda el cliente, falsificable). Rota el header → evade todos los topes. Mitigante: ninguna ruta de plata confía en el rate-limit (validan saldo/estado server-side); el PIN tiene su propio contador en tx. Fix: usar `x-vercel-forwarded-for` / último de la cadena, o Upstash Redis (ya anotado). **Se agrava con la naturaleza in-memory por instancia — misma raíz que el punto "bots" del checklist de seguridad.**
- **API-035 · MEDIUM · `/api/notify` no sanitiza `link` → push de phishing** · CONFIRMADO · `src/app/api/notify/route.ts:24,86,91` — cualquier logueado manda push con título/cuerpo/link crudos a cualquier userId. `notify-broadcast:32` SÍ sanitiza (`safeLink` debe empezar con `/`); notify no. Impacto: aviso que parece de EncomiendaYA con destino externo. Fix: aplicar el mismo `safeLink`.
- **API-036 · LOW · Fuga de `error.message` en 500 (~17 rutas viejas)** · CONFIRMADO · checkout:146, webhooks/mercadopago:310, orders/create:399, reject:85, release:159, report-problem:102, notify-drivers:57, notify:137, reviews/create:123, delivery-reviews/create:126, claims/create:210, claims/resolve:85, admin/{delete-user:92,delete-review:77,liability:111,notify-broadcast:122} — devuelven la excepción cruda. Las rutas nuevas de plata ya lo corrigieron a "Error interno". Sin SQL/tokens (Admin SDK), pero revela estructura interna. Fix: homologar a `{error:"Error interno"}` + Sentry.
- **API-037 · LOW · `orders/cancel` (camino admin) notifica al `userId` del body, no a `order.userId`** · CONFIRMADO · `src/app/api/orders/cancel/route.ts:129` — un admin con un userId equivocado en el body avisa a la persona equivocada; sin fuga de datos. Fix: usar `order.userId`.
- **API-038 · INFO · `approve-test-payment` temporal** · verificado que exige admin **full** correctamente (no es agujero); borrar antes de lanzar (ya en Pendientes de CLAUDE.md).
- **API-039 · MEDIUM (conocido) · firma HMAC del webhook MP en warning** · defensa real activa (re-consulta a MP + monto ±$1 + estado); ya en Ruta al lanzamiento.

### Frente SEGURIDAD WEB + VALIDACIÓN + SECRETOS + UPLOADS — CERRADO (verificado)
Veredicto: postura **madura**. 0 CRITICAL/HIGH nuevos. **API-034/SEC-100 (rate-limit) confirmado por DOS agentes independientes** → confianza alta.
- **SEC-100 = API-034** (mismo hallazgo, rate-limit por X-Forwarded-For). MEDIUM.
- **SEC-103 · INFO · `CRON_SECRET` comparado con `!==` (no timing-safe)** · CONFIRMADO · cron/generate-settlements:21, cron/reconcile-mp:15 — riesgo despreciable (único llamador = cron Vercel; la guarda es fail-closed, que era lo importante). Fix opcional: `crypto.timingSafeEqual`.
- **PASS con evidencia (no tocar):** los 2 `dangerouslySetInnerHTML` (chart.tsx = CSS del código; layout.tsx = script estático de tema) — sin input de usuario. Uploads: path con uid del dueño, tope 25MB, EXIF descartado; docs sensibles (licencias/DNI/reclamos) por URL firmada 5 min leyendo el path del doc, no del body → sin oráculo ni path traversal. `orders/create`/`claims/create`/`notify-broadcast`(open-redirect mitigado con safeLink)/`checkout`(back_urls server-side, sin SSRF) validan server-side. Sin command injection (0 exec/eval). `.env*` fuera de git; sin secretos hardcodeados. La apiKey de Firebase en el service worker = config pública (correcto).
- **Conocidos ya en Ruta al lanzamiento:** CSP sin script-src (rompería Leaflet/Google), firma MP en warning (defensa real: re-query a MP + idempotencia cubre replay).

### Frente ROLES + AUTORIZACIÓN — CERRADO (verificado + data scan)
Veredicto: autorización **sólida** en lo que decide plata/privilegios (PIN inaccesible al repartidor ✓, sin auto-aprobación ✓, support no escala a full ✓, tienda no reparte ✓, IDOR cerrado ✓, colecciones de plata/auditoría todas `if false` ✓). Los hallazgos abiertos son disociación entre política de PRIVACIDAD (en la UI) y su ENFORCEMENT en reglas — no escaladas de privilegio.

- **🔴 AUTHZ-001 · MEDIUM-HIGH · Un repartidor aprobado puede COSECHAR la PII completa de todos los pedidos del pool** · CONFIRMADO (regla + data) · `firestore.rules:196-198` — la regla de lectura del pool expone el DOC ENTERO de cada pedido `['En preparación','Listo para recoger']` con `deliveryPersonId==null`, y `orders/create` escribe ahí `customerPhoneNumber` (:284), `customerCoords` GPS exacto (:293), nombre y dirección. La "discreción del pool" (Fase UU) está SOLO en la UI. Con el SDK de cliente, cualquier repartidor aprobado enumera el pool y baja teléfono+GPS+dirección de todos los clientes sin tomar un pedido. **El más importante de este frente.** Fix: subcolección `orders/{id}/private` (patrón secure/pin) legible solo por el repartidor ASIGNADO+comprador+admin, dejando en el doc del pool solo storeId + ≈km + total.
- **AUTHZ-002 · MEDIUM · Notificaciones forjables → phishing/spam** · CONFIRMADO · `firestore.rules:420-426` — `notifications` create NO exige `userId==auth.uid` (a propósito, para tienda→repartidor), pero el creador controla title/body/link/icon y el destino puede ser cualquiera. Un logueado inserta en la campanita de una víctima un aviso "oficial" (`type:'admin'`) con link arbitrario. **Se cruza con API-035** (el `link` de /api/notify tampoco se sanitiza). Fix: mover creación a Admin SDK (`create: if false`) como broadcasts/refunds, o restringir por participación + link interno.
- **AUTHZ-003 · MEDIUM · Suplantación de remitente en el chat del pedido** · CONFIRMADO por regla · `firestore.rules:430-437` — `order_chats/.../messages` create solo valida que sea participante, NO que el `senderId` del mensaje == auth.uid. El comprador puede postear un mensaje marcado como enviado por la tienda/repartidor. Relevante porque el admin arbitra reclamos con ese chat (solo-lectura, Fase OO). Fix: `senderId == request.auth.uid` + `hasOnly`.
- **AUTHZ-004 · MEDIUM · Squatting de `unique_ids` (DoS de registro)** · CONFIRMADO · `firestore.rules:486-488` — cualquier logueado crea `unique_ids/{key}` con key arbitraria (el id ES el DNI/CUIT/tel), reservando preventivamente identificadores de terceros para bloquear su alta. Conocido como "molestia" en Fase TT, pero es un DoS de registro real. Fix: reserva por Admin SDK (`create: if false`) o App Check + cron que expire reservas sin cuenta.
- **AUTHZ-005 · LOW · Rama admin de `stores` update sin `hasOnly`** · CONFIRMADO (regla) / **NO explotable hoy (data scan: 0 tiendas con cuit/payoutCbu/ownerName residual)** · `firestore.rules:149` — un admin full podría reescribir campos arbitrarios (incl. payoutCbu/cuit) en el doc de tienda que es `read: if true`. Latente. Fix: `hasOnly` también en la rama admin.
- **AUTHZ-006 · LOW · `ownerId` del dueño en el doc público de tienda** · aceptable para MVP; documentar.
- **Data scan resuelto (NOT_VERIFIED → PASS):** 6/6 tiendas sin PII residual; reviews sin `userId` (privacidad UU se sostiene en datos reales).

### Frente CONCURRENCIA + IDEMPOTENCIA + WEBHOOKS — CERRADO (verificado)
Veredicto: **muy bien blindado** — stock atómico, devolución idempotente, PIN en tx, claim-once del repartidor por regla, reseñas/reembolsos/cancelación/reclamos con re-chequeo en tx (patrón `__ALREADY_*__`). Los huecos son ventanas de concurrencia (no explotables de un click):
- **🔴 BUG-200 · HIGH · Idempotencia de crear pedido NO atómica (TOCTOU)** · CONFIRMADO · `src/app/api/orders/create/route.ts:110-118` (query fuera de la tx) vs `:197` (id aleatorio) + `:210` (la tx NO revalida idempotencyKey). Dos requests con la misma clave (retry por red lenta — el público objetivo es Android de gama baja) → ambas ven `empty`, crean DOS pedidos, descuentan stock DOS veces, doble cobro potencial. Fix: id determinístico (`orders/{userId}_{key}`) con `tx.create()`, o doc centinela en la tx.
- **BUG-201 · MEDIUM · Webhook MP marca-pagado no transaccional** · CONFIRMADO · `webhooks/mercadopago:104-192` (read-check-write sin tx) — dos webhooks concurrentes con paymentIds distintos (cliente pagó 2 veces) leen ambos "no paid", ambos marcan pagado, el `duplicate_payment` NO se dispara → doble cobro invisible en tiempo real. Mitigado por la conciliación diaria (lo detecta al día siguiente). Fix: envolver lectura→chequeos→marca en runTransaction.
- **BUG-202 · LOW-MEDIUM · `confirm-stock`/`reject` con guarda de estado no transaccional** · CONFIRMADO · deriva de estado/stock si confirm-stock y reject corren a la vez sobre el mismo pedido (mismo dueño, dos botones). Fix: mover chequeo+update a runTransaction; marker de idempotencia para zeroStock.
- **BUG-203 = BUG-102 · LOW · `withdrawals/request` sin dedupe** (doble pending). CONFIRMADO. Habilita BUG-101/BUG-101.
- **BUG-204 · LOW · cron liquidación: chequeo pending + add no atómico** (ventana muy angosta, Vercel no solapa crons).
- **PASS re-verificados:** descuento de stock atómico (dos compradores por el último → sobreventa evitada), devolución de stock idempotente (marker en la misma tx), confirm-delivery/PIN en tx, tomar pedido claim-once por regla, reseñas/aprobar-rechazar retiro/reembolso/cancelar/reclamos todos con re-chequeo en tx.

### Frente REGLAS DE NEGOCIO + DINERO — CERRADO (verificado)
Veredicto: **núcleo aritmético `money.ts` CORRECTO** — invariante "suma de partes = lo que pagó el cliente" se cumple (verificado matemáticamente); serviceFee de la plataforma, comisión congelada, efectivo excluido, reembolso prorrateado. La mayoría de vectores de la Fase KK **realmente cerrados** (re-verificados en código, no de memoria).
- **🔴 BUG-101 · HIGH · TOCTOU: doble aprobación concurrente de retiros distintos de la misma cuenta → doble pago** · CONFIRMADO · `admin/approve-withdrawal:66-80` (approvableBalance calculado FUERA de la tx) + `:97-110` (la tx solo re-lee el propio doc, no recalcula saldo). Dos retiros pending de $10.000 (los produce BUG-203) aprobados en paralelo → ambos ven saldo $10.000, ambos pasan, se pagan $20.000. Solo con concurrencia (secuencial el 2º recomputa 0 y rechaza). **Misma familia que BUG-200: validación read-then-write con la tx acotada al doc individual, no al saldo agregado.** Fix: recalcular approvableBalance DENTRO de la tx, o lock por cuenta (`withdrawal_locks/{userId}`).
- **BUG-103 · MEDIUM · `confirm-stock` puede SUBIR el total sin avisar al comprador** · CONFIRMADO · `orders/confirm-stock:130-135` relee el precio del catálogo (no el congelado del pedido); `:179` `hasChanges` solo se activa si se quitan/ajustan ítems — un **aumento puro de precio no dispara aviso** → "✅ Stock Confirmado / proceder al pago" con un total mayor al aceptado. Fix: usar el `price` congelado en `order.items` para ítems sin cambio, y/o forzar aviso si `newTotal > order.total`.
- **BUG-104 · MEDIUM · El reembolso prorratea sobre las 3 partes y castiga al repartidor/plataforma por culpa de la tienda** · CONFIRMADO (decisión de producto) · `money.ts:76-79` — un reembolso por "faltó un producto" (culpa de la tienda) también recorta el envío del repartidor que entregó bien. Requiere decisión: descontar primero de la parte de la tienda, o documentar el prorrateo como aceptado.
- **BUG-105 · LOW · `refund-order` no exige `paymentStatus=='paid'`** · CONFIRMADO — se puede registrar reembolso sobre un pedido que nunca cobró. Fix: exigir paid/reversed.
- **BUG-106 · LOW · Ventanas de conciliación con huecos** (webhook perdido >7d, reversa >30d no se detectan). Documentar/ampliar.
- **BUG-107 · LOW · El admin puede marcar 'Entregado' salteando el PIN** (`order-service.ts:176` + regla admin) sin `deliveryPinVerified` — override legítimo pero debilita la evidencia del reclamo. Fix: canalizar por confirm-delivery con override auditado, o setear deliveryPinVerified:false explícito. (El repartidor SÍ está bien cerrado — no puede saltear el PIN.)
- **PASS re-verificados:** comprador no fija precio (hasOnly itemRatings), PIN no saltéable por repartidor, retiro no se resta a sí mismo, doble-aprobación del MISMO retiro bloqueada, efectivo bloqueado server-side, webhook valida monto/estado/doble-pago/reversa, checkout exige Pendiente de Pago, cron fail-closed + filtra userRole + usa isApproved.

### Frente DEPLOYMENT + OBSERVABILIDAD + TESTING + DEPS — CERRADO (verificado)
Veredicto: observabilidad **bien montada** (Sentry en 3 capas + onRequestError + 29 catches de plata reportan; sin fuga de PII en logs). Testing = **el frente más débil**.
- **INFRA-001 · HIGH (conocido, vivo) · `approve-test-payment` desplegado** · CONFIRMADO — bien blindado (admin full) pero es superficie de estado de plata en prod. **Borrar antes de lanzar** (ya en Pendientes).
- **INFRA-004 · HIGH (conocido, vivo) · firma webhook MP en warning + secret expuesto** · CONFIRMADO — mitigado por re-consulta a MP; #1 de la Ruta al lanzamiento.
- **TEST-001 · HIGH · sin framework de tests ni CI** · CONFIRMADO (`package.json` sin `"test"`, playwright solo manual) — toda la cobertura son 25 scripts `_*.js` gitignored que exigen credenciales y se corren a mano. Un `git push` no ejecuta ninguna aserción. Fruta baja: tests unitarios de las funciones puras (money.ts, delivery-pricing, geo, store-hours) sin credenciales.
- **TEST-002 · HIGH · el webhook de MP (dinero que ENTRA) sin ningún test reproducible** · CONFIRMADO — 6 ramas (monto≠, reversa, doble pago, estado inesperado, idempotencia, metadata ausente) validadas solo "en vivo una vez". Fix: test de integración mockeando payment.get/search.
- **INFRA-002 · MEDIUM · source maps no subidos a Sentry** (stack traces minificados). INFRA-003 · LOW-MED · **CORS de Storage con `origin:["*"]`** CONFIRMADO (`cors.json`) — endurecer al dominio de prod. INFRA-006 · NOT_VERIFIED · Sentry sin scrubbing PII explícito (Ley 25.326). INFRA-007 · MEDIUM · 15 vulns npm (todas tras salto MAYOR, conocido). INFRA-008 · LOW · **`patch-package` en deps sin carpeta `patches/`** CONFIRMADO (postinstall no-op). INFRA-009 · LOW · sin íconos maskable.
- **PASS:** crons = exactamente 2 (límite Hobby), dev/seed bloqueado, headers de seguridad presentes, confirm-payment 410, manifest/assetlinks OK.

### Frente BASE DE DATOS + ÍNDICES + INTEGRIDAD + ESCALA — CERRADO (verificado en prod)
Veredicto: circuitos críticos bien construidos (stock idempotente, comisión+PIN en la tx de creación, las 4 aggregations con su índice). El susto de los índices faltantes **se descartó**:
- **DB-001/DB-002 → resuelto NOT_VERIFIED → PASS (verificado en prod):** corrí las queries exactas de las billeteras contra Firestore de producción — **ambos índices compuestos EXISTEN** (orders storeId+status+createdAt ✓, withdrawals userId+userRole+createdAt ✓). Las billeteras NO están rotas. Queda solo **DB-008 · LOW-MED · drift del repo**: esos 2 índices existen en prod pero FALTAN en `firestore.indexes.json` → un entorno nuevo/DR no los tendría. Fix: `firebase firestore:indexes` → reconciliar el archivo.
- **DB-003 · MEDIUM · `computeStoreBalance/DriverBalance` sin `limit`** · CONFIRMADO (pendiente KK sigue vivo) · `payout-service.ts:86,126` — baja TODOS los entregados de la cuenta en cada aprobación de retiro y en `/api/admin/liability` (×todas las cuentas). O(pedidos) por cuenta. Fix: acumuladores `stats/` o paginar. Se activa en miles de pedidos.
- **DB-004 · MEDIUM · panel de tienda + dashboard bajan TODOS los pedidos del comercio en listener vivo** · CONFIRMADO · `store-orders-view.tsx:29`, `my-store/page.tsx:48` — sin `status`/`limit`, `onSnapshot`. Viola la regla Y/Z. Fix: acotar a estados activos + limit.
- **DB-005 · LOW · el home baja `stores` entera sin `isApproved`** · CONFIRMADO · `page.tsx:249` — manda tiendas no aprobadas al cliente (se filtran en memoria). main-nav/global-search sí filtran. Fix: `where('isApproved','==',true)`.
- **DB-006 · LOW · `/my-store/reviews` y `buyer-orders-view` sin `limit`** (colecciones sin techo). DB-007 · LOW · dashboard 8 aggregations con refreshOnFocus (costo a escala, conocido Fase HH).
- **PASS:** devolución de stock idempotente, denormalización en tx, N+1 ausente, resto de índices compuestos verificados uno a uno, trampas de índice (documentId desc, campo espejo ym, prefijo exacto) evitadas correctamente.

### Frente FRONTEND + BACKEND + MANEJO DE ERRORES — CERRADO (verificado)
Veredicto: **integridad de rutas EXCELENTE** (0 links rotos, 0 APIs inexistentes llamadas, 0 componentes de `src/components` muertos, caminos duplicados unificados = lección R1 aplicada). Los problemas son estabilidad ante datos parciales y errores tragados:
- **🔴 BUG-300 · HIGH · La capa `@/firebase` crashea TODA la app a "Algo salió mal" ante cualquier permission-denied** · VERIFICADO — 3 páginas usan la capa peligrosa (`favorites`, `my-store/categories`, `admin/delivery/[driverId]`); `use-collection.tsx:107` emite → `FirebaseErrorListener` re-lanza → global-error. **Explica el crash intermitente del arranque y el "INTERNAL ASSERTION FAILED" de /favorites.** `admin/delivery/[driverId]` corre queries admin-gated ANTES del guard → un support o un estado transitorio crashea. Fix: migrar las 3 a `@/lib/firebase` (que no emite). Es la punta del proyecto "unificar las 2 capas de Firebase".
- **BUG-301 · HIGH · Panel del repartidor: flash "No hay pedidos disponibles" antes de cargar** · VERIFICADO · `delivery-orders-view.tsx:122,138` no destructuran `isLoading` — el repartidor ve "no hay trabajo" un instante y puede cerrar la app. Fix: gate de carga.
- **BUG-304 · MEDIUM · `order.total` SIN guarda crashea el panel de tienda y el CTA de pago** · VERIFICADO · `store-orders-view.tsx:360` (`order.total.toLocaleString()`), `order-status-updater.tsx:331` (`order.total.toFixed(2)`). **El fix de Fase HH `(order.total||0)` cubrió el dashboard admin pero NO estos dos.** Un pedido pre-pago malformado tira el render de toda la lista de la tienda. Fix: `(order.total||0)`.
- **BUG-303 · MEDIUM · `order.items` sin guarda crashea el detalle** · VERIFICADO · `orders/[orderId]/page.tsx:316` (`.forEach`) — pedido sin `items` → pantalla blanca. Fix: `order.items ?? []`.
- **BUG-302 · MEDIUM · Editar dirección en perfil NO es atómico (pérdida de datos)** · VERIFICADO · `profile/page.tsx:217-223` — arrayRemove + arrayUnion en 2 writes; si la 2ª falla, se pierde la dirección con su GPS. Fix: un solo updateDoc/writeBatch.
- **BUG-305 · MEDIUM · Chat del pedido: catch silencioso** · VERIFICADO · `chat-window.tsx:138` — si el mensaje falla, el usuario cree que coordinó la entrega y el otro no lo recibió. Fix: toast+Sentry.
- **BUG-306 · MEDIUM · `toggleFavoriteProduct` sin try/catch** · VERIFICADO · `stores/[storeId]/page.tsx:192` — falla silenciosa en acción frecuente. Fix: try/catch+toast.
- **BUG-307 · MEDIUM · La capa `@/lib/firebase` traga TODOS los errores** · VERIFICADO · `firebase.ts:104,121` — permission-denied o índice faltante se ven como "no hay datos" (buyer-orders "No tienes pedidos" aunque los tenga). El dashboard admin es el único que hace el estado de error bien (modelo a replicar). Fix: exponer `error` en los hooks.
- **FUNC-300 · LOW (pre-lanzamiento) · contacto de soporte falso** · VERIFICADO · `support/page.tsx:123` (`soporte@encomiendaya.test` inexistente, teléfono simulado). Decidir canal real.
- **FUNC-301 · LOW · componentes muertos con reseñas SIMULADAS / éxito falso** · VERIFICADO (0 importadores) · `stores/[storeId]/product-reviews-dialog.tsx`, `orders/[orderId]/leave-review-dialog.tsx` — inertes pero peligrosos si se recablean. Borrar.
- **BUG-308/FUNC-303 · LOW · catches menores + formato de moneda del carrito con `.toFixed(2)`** (inconsistente con es-AR del resto).

---

## 🔀 FASE 33 — AUDITORÍA CRUZADA (patrones sistémicos entre frentes)

La consolidación de los 8 frentes revela **4 temas transversales** (más valiosos que los hallazgos sueltos):

1. **TEMA A — Read-then-write FUERA de la transacción (TOCTOU).** El patrón más repetido y el de mayor impacto: la validación (saldo, idempotencyKey, estado de pago) se hace antes de una transacción acotada solo al doc individual, no al invariante agregado. Instancias: **BUG-200** (crear pedido, HIGH), **BUG-101** (aprobar retiro, HIGH), **BUG-201** (webhook, MEDIUM), BUG-102/203 (solicitar retiro), BUG-202 (confirm-stock), BUG-204 (cron). Fix de raíz común: mover la validación DENTRO de la tx o usar docs-lock/id determinístico.
2. **TEMA B — Política de PRIVACIDAD implementada en la UI pero NO en las reglas.** Las decisiones de la Fase UU quedaron como enforcement de frontend: **AUTHZ-001** (el pool expone teléfono+GPS de todos los clientes al repartidor, MEDIUM-HIGH), AUTHZ-002 (notificaciones forjables), AUTHZ-003 (suplantación en el chat). El SDK de cliente saltea la UI.
3. **TEMA C — Canales de escritura abiertos al cliente que deberían ser Admin SDK.** `notifications` create, `order_chats` messages, `unique_ids` create — todos permiten escritura directa del cliente con validación de forma pero no de intención (AUTHZ-002/003/004).
4. **TEMA D — Migración de Firebase a medias = fallas opuestas.** `@/firebase` **crashea toda la app** (BUG-300) y `@/lib/firebase` **traga todo en silencio** (BUG-307) — las dos caras de la unificación pendiente. Más las guardas faltantes (BUG-303/304) que convierten un dato parcial en pantalla blanca.

Consistencias verificadas OK: no hay ruta sin funcionalidad ni funcionalidad sin ruta; los caminos duplicados críticos están unificados (R1); las operaciones de plata usan money.ts como única fuente; los crons y gates admin full/support son coherentes.

## 📊 FASE 32 — MATRIZ DE RIESGO

**P1 — CRITICAL (resolver antes de lanzar):**
- BUG-200 · doble pedido/stock/cobro por idempotencyKey TOCTOU (plata+inventario)
- BUG-101 · doble aprobación concurrente de retiro → doble pago (plata sale)
- AUTHZ-001 · repartidor cosecha teléfono+GPS+dirección de TODOS los clientes (privacidad a escala, Ley 25.326)
- BUG-300 · crash global "Algo salió mal" en 3 páginas (estabilidad, usuarios reales)
- INFRA-001 · borrar `approve-test-payment` (limpieza bloqueante de lanzamiento)
- INFRA-004 · firma webhook MP + regenerar `MP_WEBHOOK_SECRET` (integridad de pagos, #1 pendiente)

**P2 — HIGH (antes de lanzar salvo justificación):**
- BUG-201 · doble pago invisible en ventana concurrente del webhook (mitigado por conciliación diaria)
- BUG-103 · confirm-stock puede subir el total sin avisar al comprador
- AUTHZ-002 + API-035 · phishing por notificaciones forjables (regla + link de /api/notify)
- AUTHZ-003 · suplantación de remitente en el chat (afecta arbitraje de reclamos)
- AUTHZ-004 · squatting de unique_ids (DoS de registro)
- BUG-304 + BUG-303 · crash del panel de tienda / pago / detalle por datos parciales
- BUG-301 · flash "sin pedidos" del repartidor
- API-034/SEC-100 · rate-limit evadible por X-Forwarded-For
- TEST-001 + TEST-002 · sin CI; webhook de MP sin test reproducible

**P3 — MEDIUM (planificable):** BUG-104 (reembolso prorrateado — decisión de producto), BUG-302 (dirección no atómica), BUG-305/306/307 (errores silenciosos), BUG-202 (confirm-stock/reject race), AUTHZ-005 (stores hasOnly latente), DB-003/DB-004 (queries sin techo), INFRA-002/003/006 (source maps/CORS/PII Sentry), INFRA-007 (npm vulns).

**P4 — LOW/deuda:** API-036/037, BUG-105/106/107, BUG-203/204, AUTHZ-006, DB-005/006/007/008, INFRA-005/008/009, FUNC-300/301/303, SEC-103, FUNC-302.

## ✅ CORRECCIONES APLICADAS (post-auditoría, verificadas + desplegadas)

**Tanda 1 — Dinero/TOCTOU** (commit `57ee107`): BUG-200 (idempotencia de crear pedido con doc centinela en la tx), BUG-101 (aprobar retiro recalcula saldo DENTRO de la tx con tx.get(query)), BUG-203 (solicitar retiro deduplica pending en tx). Verificado `_e2e-concurrency.js` **12/12** bajo concurrencia real (dos retiros de $10.500 con saldo $10.500 aprobados en paralelo → solo uno pasa, sin doble pago).

**Tanda 2 — Privacidad** (commit `478d724`): AUTHZ-001 — la PII de alta sensibilidad (teléfono/GPS/dirección) salió del doc que ve el pool a una colección `order_private/{orderId}`; el doc principal conserva el nombre + `deliveryDistanceM` (distancia denormalizada). Nueva `/api/orders/take` que asigna en tx claim-once Y espeja `deliveryPersonId` en `order_private` (resuelve el lag del get() de reglas — el repartidor lee la dirección al instante tras tomar). Autoasignación directa del cliente cerrada (toda toma por API, lección R1). Verificado `_e2e-pool-privacy.js` **10/10** contra reglas de producción. **Residual anotado:** pedidos legacy (pre-deploy) aún tienen PII embebida — se van con la limpieza del seed; para datos reales haría falta un backfill.

**Tanda 3 — Estabilidad** (commit `726ee90`): BUG-300 (FirebaseErrorListener ya no re-lanza los permission-error → no crashea la app; reporta a Sentry — cierra el "Algo salió mal" intermitente), BUG-304 (`order.total` con guarda en panel de tienda + CTA de pago), BUG-303 (`order.items` con guarda en el detalle). /verificar OK.

**NO tocados a propósito** (P1 restantes): INFRA-001 (borrar `approve-test-payment`) — se necesita para la gran prueba en curso, se borra al lanzar. INFRA-004 (firma webhook MP + regenerar secret) — requiere credenciales de MP + pago real, es la tarea del bloque MP.

**Estado P1: 4 de 6 resueltos y desplegados. Faltan los 2 pendientes conocidos** (approve-test-payment cleanup + firma MP), que van en su momento propio.

**Tanda P2 — Seguridad** (commit `56bcfb1`): AUTHZ-002+API-035 (phishing por notificaciones — la regla exige link interno + /api/notify lo sanitiza; cierra el phishing a sitio EXTERNO), AUTHZ-003 (anti-suplantación en el chat — la regla exige `senderId == uid` + forma exacta), API-034/SEC-100 (rate-limit por `x-vercel-forwarded-for` no falsificable). Verificado `_e2e-notif-chat.js` **8/8** contra reglas de producción.
**Tanda P2 — 2ª parte** (commit `87cd05d`): BUG-201 (webhook MP ahora marca pagado dentro de una transacción → cierra el doble-cobro invisible en ventana concurrente; mismo patrón TOCTOU de la Tanda 1), BUG-301 (gate de carga en el panel del repartidor → ya no muestra "sin pedidos" un instante antes de cargar). /verificar OK.
**Tanda P2 — 3ª parte** (commit `49d55b1`): BUG-103 (confirm-stock respeta el precio CONGELADO del pedido, no el catálogo actual → el total ya NO puede subir sin aviso; el precio de order.items lo verifica create y el comprador no puede editarlo, así que releer del catálogo era justo lo que causaba el bug). Verificado `_e2e-price-freeze.js` **5/5** (subir el catálogo x3 no cambia el total) + regresión `_e2e-adjust-qty` **19/19**.
- **P2 restantes (no hechos):** AUTHZ-004 (squatting de unique_ids → mover reserva a Admin SDK, refactor), residual de AUTHZ-002 (spam de notif interna falsa → Admin SDK + App Check), TEST-001/002 (CI + test del webhook MP).
- **Estado P2: 6 resueltos.** Quedan los 2 refactors de escritura-cliente→Admin-SDK (AUTHZ-004 + residual AUTHZ-002) y el frente de testing/CI.

## 🏁 VEREDICTO FINAL

### 🟡 READY WITH CONDITIONS — NO lanzar hoy; a una lista P1 acotada de estarlo.

**Fundamento:** las bases son sólidas y no requieren rearquitectura — `money.ts` es aritméticamente correcto (invariante verificado), la autorización es madura (PIN inaccesible al repartidor, sin auto-aprobación, support no escala, IDOR cerrado, colecciones de plata solo Admin SDK), la integridad de rutas es excelente, la observabilidad está bien montada, y la mayoría de los vectores de las auditorías previas (K/L/KK/TT/UU) están **realmente cerrados** (re-verificados en código, no de memoria). El susto mayor (índices de billetera faltantes) se descartó verificando producción.

Pero hay **6 condiciones P1 abiertas** que combinan integridad de dinero (2 TOCTOU), privacidad a escala (cosecha de PII del pool), estabilidad (crash global) y 2 pendientes de lanzamiento ya conocidos (borrar ruta de prueba + firma MP). Ninguna es un exploit anónimo de un click, pero todas son reales y de las que "hay que responder personalmente" si salen mal. No se puede declarar READY con P1 de pérdida de plata/datos sin resolver.

**0 CRITICAL de explotación anónima inmediata · 6 P1 · ~9 P2 · resto P3/P4.**

**Plan de corrección (orden):** resolver los 6 P1 → regresión (portar los scripts `_*.js` críticos + tests nuevos de webhook/concurrencia) → resolver P2 → re-auditoría de los frentes tocados → re-verificar los P1 → lanzar.

### Pregunta final obligatoria (Fase 45)
*"Si tuviera que responder personalmente por pérdida de datos, fraude, acceso indebido o caída del sistema, ¿qué no comprobé?"* — Lo que queda genuinamente `NOT_VERIFIED` y necesitaría runtime: (a) el comportamiento REAL bajo concurrencia de BUG-200/BUG-101 (un test de carrera con dos clientes Admin SDK simultáneos lo confirmaría — el análisis estático dice que la ventana existe); (b) INFRA-006 (si Sentry está recibiendo PII de compradores en los payloads de error); (c) que la regeneración del MP_WEBHOOK_SECRET y las env vars de prod estén efectivamente configuradas (no verificable desde el código). Todo lo demás se verificó por lectura + los checks en vivo de esta sesión (índices, PII residual, reviews).
