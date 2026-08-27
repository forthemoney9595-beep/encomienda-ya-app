---
name: verificar
description: Verificación completa pre-push de EncomiendaYA — typecheck + lint + build completo, con veredicto claro. Correr SIEMPRE antes de git push; nació del deploy que falló el 18/8 por mirar solo la mitad del build.
---

# /verificar — chequeo completo antes de subir

Lección de origen (18/8/2026): un deploy de Vercel falló porque el build local se miró
a medias — "✓ Compiled successfully" es SOLO la compilación; el lint corre después y
Vercel trata sus errores como fatales.

## Pasos (en orden; al primer fallo, parar y reportar)

1. **Typecheck** — `npx tsc --noEmit` → exit 0, sin errores.
2. **Lint** — `npx next lint` → contar líneas con "Error:" → debe ser **0**.
   (Los *warnings* no frenan el deploy — `no-img-element`, `exhaustive-deps` son
   conocidos y aceptados. Los *Error* sí lo frenan.)
3. **Tests unitarios** — `npm run test` (Vitest) → todos verdes. Son las funciones puras
   que deciden pagos (`money.ts`, `geo.ts`, `delivery-pricing.ts`); no necesitan
   credenciales. Si tocaste una de esas, el test tiene que seguir pasando (y agregá el
   caso nuevo). También corren en CI (GitHub Actions) en cada push/PR.
4. **Build completo** — `npm run build` → leer TODO el final de la salida, nunca solo
   la primera línea. Éxito = "✓ Compiled successfully" **y** "Generating static pages
   (N/N)" **y** ningún "Failed to compile" ni bloque de errores de lint al final.

## Veredicto (siempre, explícito)

- ✅ **Listo para push** — los 4 pasos limpios.
- 🚨 **NO subir** — decir exactamente qué paso falló y el error, y arreglarlo antes.

## Reglas

- **NUNCA `git push` con cualquiera de los 4 pasos fallando.**
- Si se tocó **plata, reglas de Firestore o rutas de API sensibles**: además correr los
  e2e correspondientes (`_e2e-*.js`, gitignored — necesitan dev server local y van
  contra Firestore real; ver CLAUDE.md para cuál cubre qué).
- OJO: `npm run build` y el dev server **comparten `.next`** — si el dev server estaba
  corriendo durante el build, reiniciarlo después (si no, sirve chunks 404).
- Tras el push, si el cambio importa en producción: verificar que el deploy nuevo llegó
  (buscar un texto distintivo del cambio en el bundle desplegado, patrón del 18/8).
