// ESLint 9 (config plana). Next 16 eliminó `next lint`; el script `npm run lint` corre
// `eslint src`, el mismo alcance que `next lint` tenía antes. Misma base de reglas que la
// config vieja (`next/core-web-vitals`), a propósito sin `eslint-config-next/typescript`
// para no sumar reglas nuevas en el salto de versión.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    // Reglas del React Compiler (eslint-plugin-react-hooks 6+, llegaron con Next 16). En el
    // salto 14→16 dieron 64 errores en código que ya funcionaba (setState dentro de
    // useEffect para suscripciones, componentes definidos dentro del render del dashboard
    // admin, Date.now() en render...). Se dejan en WARNING para que la migración no mezcle
    // dos cosas distintas: siguen visibles para una pasada dedicada posterior, sin bloquear
    // el lint ni el CI hoy. No bajar a 'off': son señales reales de rendimiento.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'node_modules/**', 'next-env.d.ts', 'playwright-report/**']),
]);
