import type { Metadata } from 'next';
import { Sofia_Sans, Sofia_Sans_Condensed } from 'next/font/google';
import './globals.css';

// Rediseño 2 (Toldo): letras servidas por next/font (se alojan con la app, sin pedido extra
// a Google en cada carga, mejor en celulares de gama baja que el <link> de antes).
const fontBody = Sofia_Sans({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body', display: 'swap' });
const fontCartel = Sofia_Sans_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-cartel', display: 'swap' });
import { Toaster } from '@/components/ui/toaster';
import { CartProvider } from '@/context/cart-context';
import { AuthProvider } from '@/context/auth-context';
// ✅ CORRECCIÓN FINAL: Importación de ChatListener desde '@/components/'
import { ChatListener } from '@/components/chat-listener'; 
import { AppContent } from './app-content';
import { DevPreviewPanel } from '@/components/dev-preview-panel';

// 🚀 METADATOS OPTIMIZADOS PARA SEO Y REDES SOCIALES
export const metadata: Metadata = {
  title: {
    default: 'EncomiendaYA | Envíos Rápidos y Seguros en tu Ciudad',
    template: '%s | EncomiendaYA',
  },
  description: 'Tu solución de entregas y mensajería ultrarrápida. Envía paquetes, documentos y comida con seguimiento en tiempo real.',
  keywords: ['encomienda', 'mensajería', 'delivery', 'logística', 'envíos', 'rastreo', 'rápido'],
  openGraph: {
    title: 'EncomiendaYA - Envíos Rápidos',
    description: 'La app de mensajería más eficiente de tu ciudad.',
    url: 'https://encomiendaya.com', // Reemplazar con tu URL real
    siteName: 'EncomiendaYA',
    images: [
      {
        url: 'https://placehold.co/1200x630/4f46e5/ffffff?text=EncomiendaYA', // Reemplazar con URL de imagen real (1200x630px)
        width: 1200,
        height: 630,
        alt: 'Logo de EncomiendaYA y descripción del servicio',
      },
    ],
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EncomiendaYA',
    description: 'La app de mensajería más eficiente de tu ciudad.',
    creator: '@EncomiendaYA', // Reemplazar con tu handle de Twitter
    images: ['https://placehold.co/800x418/4f46e5/ffffff?text=EncomiendaYA'], // Reemplazar con URL de imagen real (800x418px)
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    // El tema se elige en Perfil (localStorage 'eya-theme'). Rediseño 2 (Toldo): el
    // default pasó a CLARO (se lee mejor al sol y es lo que pidió la dirección elegida);
    // quien eligió oscuro a mano lo conserva. El script aplica la clase ANTES del primer
    // paint para que no haya parpadeo; suppressHydrationWarning porque la pone el script.
    <html lang="es" className={`${fontBody.variable} ${fontCartel.variable}`} suppressHydrationWarning>
      <head>
        {/* PWA: Color de la barra de estado del navegador/móvil */}
        <meta name="theme-color" content="#FFFFFF" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('eya-theme')==='dark'){document.documentElement.classList.add('dark');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#1C1F22');}}catch(e){}`,
          }}
        />
        {/* PWA: el manifest vive en src/app/manifest.json (Next lo sirve como
            /manifest.json — NO crear otro en public/, genera un conflicto de rutas). */}
        <link rel="manifest" href="/manifest.json" />

        {/* iOS: instalada desde Safari ("Agregar a inicio") abre standalone con este ícono */}
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EncomiendaYA" />

        {/* leaflet.css se importa UNA vez desde globals.css (PERF-010): acá estaba duplicado desde unpkg, bloqueando el primer paint en TODAS las rutas. */}
      </head>
      <body className="font-body antialiased">
          <AuthProvider>
            <CartProvider>
              {/* Tanda C: se eliminó NotificationProvider — su contador no lo leía
                  NADIE (el badge real de la campanita sale de Firestore) y su única
                  función era causar el loop del ding (Tanda A). */}
              <ChatListener />
              <AppContent>
                {children}
              </AppContent>
            </CartProvider>
          </AuthProvider>
        <Toaster />
        {/* SOLO servidor local (9/11): elegir color de marca y sonido. Borrar al decidir. */}
        {process.env.NODE_ENV === 'development' && <DevPreviewPanel />}
      </body>
    </html>
  );
}