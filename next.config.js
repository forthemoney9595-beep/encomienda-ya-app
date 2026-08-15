const { withSentryConfig } = require('@sentry/nextjs');

// Headers de seguridad HTTP (auditoría de seguridad, ago 2026). Antes NO había ninguno.
// A propósito NO se pone una CSP estricta de script-src/style-src: la app usa Leaflet
// (estilos inline en los divIcon), Google Sign-in (popup), Google Fonts y los estilos
// inline de Next/Tailwind — una CSP mal calibrada rompería la app en producción justo
// antes de lanzar. Se usa `frame-ancestors 'self'` (protección anti-clickjacking moderna,
// sin riesgo de bloquear recursos) + los headers clásicos, todos de bajo riesgo.
// OJO: `geolocation=(self)` es obligatorio — el checkout y el tracking del repartidor la
// necesitan; sin esta línea el Permissions-Policy la bloquearía.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/**",
      },
       {
        protocol: "https",
        hostname: "storage.googleapis.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  // Sin org/project/authToken todavía -> no sube source maps (los stack traces
  // en Sentry se van a ver minificados por ahora). El monitoreo de errores en
  // sí funciona igual, esto es solo para que las líneas de código sean legibles.
});
