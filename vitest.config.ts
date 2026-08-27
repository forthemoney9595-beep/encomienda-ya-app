import { defineConfig } from 'vitest/config';

// Tests unitarios de las funciones PURAS del proyecto (money/geo/delivery-pricing/…):
// no tocan Firestore ni necesitan credenciales, así que corren en CI sin secretos.
// Los scripts `_e2e-*.js` (integración contra Firestore real) NO son tests de Vitest —
// se quedan afuera por el patrón de include (solo *.test.ts) y por el exclude explícito.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', '.next', '_*.js', 'e2e'],
    environment: 'node',
  },
});
