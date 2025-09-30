'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarInset, SidebarFooter } from '@/components/ui/sidebar';
import { MainNav } from '@/components/main-nav';
import Logo from '@/components/logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Notifications } from '@/components/notifications';
import { Cart } from '@/components/cart';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User, LogOut, Shield, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getPlaceholderImage } from '@/lib/placeholder-images';

export function AppContent({ children }: { children: React.ReactNode }) {
    const { user, loading, isAdmin, logoutForPrototype } = useAuth();
    const router = useRouter();

    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (event.reason && typeof event.reason.message === 'string' && event.reason.message.includes('MetaMask')) {
                console.warn('Se detectó y se ignoró un error no crítico de MetaMask.', event.reason);
                event.preventDefault();
            }
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out from Firebase:", error);
        } finally {
            logoutForPrototype();
            router.push('/login');
        }
    };

    return (
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
                    {loading ? (
                        <div className='p-3 flex items-center gap-3 group-data-[collapsible=icon]:justify-center'>
                           <Loader2 className="h-9 w-9 animate-spin text-sidebar-primary" />
                        </div>
                    ) : user ? (
                        <SidebarFooter>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <div className="flex items-center gap-3 p-3 group-data-[collapsible=icon]:justify-center hover:bg-sidebar-accent/50 cursor-pointer rounded-md">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={getPlaceholderImage(user.name, 40, 40)} alt={user.name} />
                                            <AvatarFallback>{user.name?.[0].toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                                            <span className="text-sm font-semibold text-sidebar-foreground">{user.name}</span>
                                            <span className="text-xs text-sidebar-foreground/70">{user.email}</span>
                                        </div>
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent side="top" align="start" className="w-56 mb-2 ml-2">
                                    <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link href="/profile">
                                            <User className="mr-2 h-4 w-4" />
                                            <span>Perfil</span>
                                        </Link>
                                    </DropdownMenuItem>
                                    {isAdmin && (
                                        <DropdownMenuItem asChild>
                                            <Link href="/admin">
                                                <Shield className="mr-2 h-4 w-4" />
                                                <span>Panel Admin</span>
                                            </Link>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleSignOut}>
                                        <LogOut className="mr-2 h-4 w-4" />
                                        <span>Cerrar Sesión</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </SidebarFooter>
                    ) : null}
                </Sidebar>
                <SidebarInset>
                    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
                        <div className="ml-auto flex items-center gap-4">
                            <Notifications />
                            <Cart />
                            {!loading && !user && (
                                <Link href="/login">
                                    <Button>Iniciar Sesión</Button>
                                </Link>
                            )}
                        </div>
                    </header>
                    <main className="flex-1 p-4 md:p-6">
                        {children}
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    );
}
