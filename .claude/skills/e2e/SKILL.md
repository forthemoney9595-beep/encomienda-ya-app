---
name: e2e
description: Corre la batería de verificación real de EncomiendaYA (e2e contra Firestore real, ataques a reglas, conciliación de plata, Playwright a 430px, tests de reglas en el emulador) y deja residuo cero. Usar después de tocar plata, reglas, rutas de API sensibles o pantallas — y siempre antes de un push de esos cambios. Argumento opcional: `money` | `rules` | `ui` | `all` (default all).
---

# /e2e — verificación real, con residuo cero

Todo lo que no es un test unitario puro vive fuera de Vitest y pega a **Firestore real** con
las cuentas `@test.com`. Correr de a uno (el rate limit de `create` vive en memoria del dev
server) y verificar residuo al final.

## 0. Preparación
1. Cerrar dev servers huérfanos en :3000 (`netstat -ano | grep :3000` → `taskkill //PID`):
   uno viejo hace que los e2e prueben código anterior (pasó en la auditoría de octubre).
2. Levantar `npm run dev` y esperar "Ready"; pre-calentar las rutas con `curl` antes de
   Playwright (`waitUntil: 'domcontentloaded'`, nunca `networkidle`).
3. Si se tocaron **reglas**: `firebase deploy --only firestore:rules --dry-run` → deploy →
   recién entonces los `_attack-*.js` (prueban contra producción). Si la regla nueva corta
   una escritura que el código viejo todavía hace, verificar que no haya operaciones en
   curso (ej. 0 repartos en la calle) o desplegar código primero.

## 1. Según el argumento
- **money** (plata / pedidos): `_e2e-stock.js` 13 · `_e2e-adjust-qty.js` 19 ·
  `_e2e-confirm-vs-cancel.js` 19 · `_e2e-pin.js` 15 · `_e2e-payout.js` 21 ·
  `_e2e-claims.js` 31 · `_e2e-concurrency.js` 12 · `_audit-money.js` (solo lectura, tiene
  que decir CUADRA) · `npm run test` (Vitest, invariantes de money.ts).
- **rules**: `npm run test:rules` (emulador local, carga `firestore.rules` del repo — exige
  Java 21) · `_attack-order-state.js` 14 · `_attack-money.js` · `_attack-roles.js` ·
  `_e2e-pool-privacy.js` 10 · `_e2e-notif-chat.js` 8 (contra producción, después del deploy).
- **ui**: `_pw-tanda2-visual.js` 24 (14 pantallas, 3 roles, overflow + contraste) ·
  `_pw-tanda1-ui.js` 9 (login/términos/carrito/checkout) · `_pw-firebase-unify.js` 12 ·
  `_pw-require-role.js` 11 · `_pw-settings-ranges.js` 9. Agregar el script nuevo de la
  feature si lo hay.
- **all**: los tres bloques, en ese orden.

## 2. Residuo cero (siempre)
Contar `orders`, `order_private`, `order_idempotency`, `withdrawals`, `claims`,
`notifications` y los subdocs `secure/pin` y `live/driver` antes y después; los huérfanos
(sin pedido padre) se borran verificando con Admin SDK. Usar `_check-clean.js` o el patrón
`check-residue` del scratchpad.

## 3. Veredicto
Reportar cada suite con su N/N, qué NO se pudo probar y por qué ("a confirmar"), y si quedó
residuo. Un ✅ sin ground truth (lectura fresca con Admin SDK) no cuenta. Después, `/verificar`
antes del push.
