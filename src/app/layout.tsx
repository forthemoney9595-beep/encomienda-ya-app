import type { Metadata } from 'next';
import './globals.css';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarInset, SidebarFooter } from '@/components/ui/sidebar';
import { MainNav } from '@/components/main-nav';
import Logo from '@/components/logo';
import { Toaster } from '@/components/ui/toaster';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Notifications } from '@/components/notifications';
import { CartProvider } from '@/context/cart-context';
import { Cart } from '@/components/cart';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User, LogOut, Shield } from 'lucide-react';
import { AuthProvider } from '@/context/auth-context';
import { AppContent } from './app-content';

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
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          <CartProvider>
            <AppContent>
              {children}
            </AppContent>
          </CartProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
