---
name: lanzamiento
description: Checklist viva de lanzamiento a producción real de EncomiendaYA — qué falta, en qué orden, qué decide David y cómo se verifica cada paso. Usar para "¿qué falta para lanzar?", para ejecutar el bloque pre-lanzamiento (MercadoPago, desmontaje de la infraestructura de prueba, Play Store, marketing) y para actualizar la nota "Ruta al lanzamiento" de la bóveda.
---

# /lanzamiento — del estado actual a producción real

Fuentes de verdad: `CLAUDE.md` (sección "Pendientes pre-lanzamiento" + Fase VV),
`docs/AUDIT_2026-10.md` (hallazgos con estado) y la bóveda `D:\KEys\EncomiendaYA-Vault\`
("Ruta al lanzamiento", "Legal y Play Store", "App Android", "Nombre, dominio y costos",
nota 🟢 ÚLTIMA). Esta skill no repite el detalle: ordena y verifica.

## Bloques, en orden
1. **Decisiones de David (bloquean lo demás):** vencimiento del link de pago de MP (sugerido
   30 min) · `pushEnabled` (re-registro manual del push) · Vercel Pro (obligatorio: Hobby
   prohíbe uso comercial) · Next 16 (2 RCE en Next 14, salto mayor en rama aparte) ·
   acumuladores de saldo (solo a escala; diseño conjunto).
2. **Bloque MercadoPago (juntos, con su panel):** firma del webhook revisada y exigida ·
   `MP_WEBHOOK_SECRET` regenerado · devolución por API (`POST /v1/payments/{id}/refunds`)
   que SOLO ejecuta lo que el admin aprobó en el diálogo · vencimiento de preferencia ·
   un pago real chico + su devolución + conciliación verificada con `checkedPayments > 0`.
3. **Desmontaje de la prueba:** borrar `approve-test-payment` (ruta + botón 🧪) · limpiar
   seed (`_seed-stores.js --undo`, `_clean-for-test.js --dry-run` primero) · pedidos con
   `simulatedPayment == true` · cuentas de prueba que no sean las 4 base · backfill de PII
   legacy a `order_private` si quedan pedidos reales viejos.
4. **Operación:** alertas de presupuesto en Firebase Blaze · Sentry con source maps
   (`SENTRY_AUTH_TOKEN`) y scrubbing de PII · TTL de Firestore en `notifications` ·
   backups verificados con una restauración de prueba · mail de soporte real (hoy
   `soporte@encomiendaya.test`) · dominio propio.
5. **Play Store:** AAB con el keystore de `D:\KEys\EncomiendaYA-Android\` (packageId
   `com.encomiendaya.app`, inmutable) · ficha (capturas 430 px, descripción, política de
   privacidad pública) · íconos `maskable` con fondo · revisión de Google (días: arrancar
   temprano).
6. **Marketing y adopción (agente `marketing-tinogasta`):** captar 8-10 tiendas y 3-5
   repartidores ANTES de abrir a clientes · plan de 30 días por barrio/rubro · WhatsApp +
   Instagram local + carteles · métricas de lanzamiento definidas con `analista-datos`
   (pedidos/día, tiempo de entrega, cancelaciones, repartidores activos, reclamos/100).
7. **Prueba final de punta a punta** con el circuito real (pago MP real, push en celular,
   GPS en vivo, PIN, reseña, reclamo, retiro aprobado con comprobante) y residuo cero.

## Cómo se usa
- Sin argumento: imprimir el estado de cada bloque (hecho / pendiente / decisión) leyendo las
  fuentes, y proponer el próximo paso concreto.
- Con argumento (`mp`, `desmontaje`, `operacion`, `play`, `marketing`, `final`): ejecutar ese
  bloque con sus verificaciones y actualizar "Ruta al lanzamiento" en la bóveda al terminar.
- Regla: nada de este checklist se marca hecho sin evidencia (número, captura, lectura con
  Admin SDK). Lo que no se pudo verificar queda "a confirmar".
