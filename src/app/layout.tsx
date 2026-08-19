import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { CartProvider } from '@/context/cart-context';
import { AuthProvider } from '@/context/auth-context';
// ✅ CORRECCIÓN FINAL: Importación de ChatListener desde '@/components/'
import { ChatListener } from '@/components/chat-listener'; 
import { AppContent } from './app-content';
import { FirebaseClientProvider } from '@/firebase';

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
    // Rediseño D4 (19/8): el `dark` dejó de estar forzado — el tema se elige en Perfil
    // (localStorage 'eya-theme', default oscuro = la identidad de siempre). El script
    // de abajo aplica la clase ANTES del primer paint para que no haya parpadeo;
    // suppressHydrationWarning porque la clase la pone el script, no el server.
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        {/* PWA: Color de la barra de estado del navegador/móvil */}
        <meta name="theme-color" content="#8B5CF6" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('eya-theme')==='light'){document.documentElement.classList.remove('dark');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#F6F5FA');}}catch(e){}`,
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

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin="" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
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
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}