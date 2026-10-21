import { defineConfig } from 'vitest/config';

// Tests de REGLAS de Firestore contra el emulador (tests/rules/*). Van en config aparte para
// que `npm run test` (unitarios puros, sin Java ni emulador) siga siendo rápido; se corren con
// `npm run test:rules`, que levanta el emulador, ejecuta esto y lo apaga.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
