import type { Metadata } from 'next';
import './globals.css';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarInset, SidebarFooter } from '@/components/ui/sidebar';
import { MainNav } from '@/components/main-nav';
import Logo from '@/components/logo';
import { Toaster } from '@/components/ui/toaster';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import Link from 'next/link';

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
        <SidebarProvider>
          <div className="flex min-h-screen">
            <Sidebar side="left" className="w-64" collapsible="icon">
              <SidebarHeader>
                <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
                  <Logo />
                  <span className="font-headline text-lg font-bold group-data-[collapsible=icon]:hidden">EncomiendaYA</span>
                </div>
              </SidebarHeader>
              <SidebarContent>
                <MainNav />
              </SidebarContent>
              <SidebarFooter>
                <div className="flex items-center gap-3 p-3 group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src="https://picsum.photos/seed/avatar/40/40" alt="Admin" />
                    <AvatarFallback>A</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                    <span className="text-sm font-semibold text-sidebar-foreground">Admin</span>
                    <span className="text-xs text-sidebar-foreground/70">admin@email.com</span>
                  </div>
                </div>
              </SidebarFooter>
            </Sidebar>
            <SidebarInset>
              <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
                <div className="ml-auto flex items-center gap-4">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Bell className="h-5 w-5" />
                    <span className="sr-only">Ver notificaciones</span>
                  </Button>
                  <Link href="/login">
                    <Button>Iniciar Sesión</Button>
                  </Link>
                </div>
              </header>
              <main className="flex-1 p-4 md:p-6">
                {children}
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
        <Toaster />
      </body>
    </html>
  );
}
