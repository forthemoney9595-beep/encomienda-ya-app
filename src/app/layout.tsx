import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { CartProvider } from '@/context/cart-context';
import { AuthProvider } from '@/context/auth-context';
import { AppContent } from './app-content';
import { PrototypeDataProvider } from '@/context/prototype-data-context';

export const metadata: Metadata = {
  title: 'EncomiendaYA',
  description: 'Tu solución de entregas',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""/>
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          <CartProvider>
            <PrototypeDataProvider>
              <AppContent>
                {children}
              </AppContent>
            </PrototypeDataProvider>
          </CartProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
