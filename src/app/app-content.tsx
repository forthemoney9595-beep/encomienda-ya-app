
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarInset, SidebarFooter, useSidebar, SidebarTrigger } from '@/components/ui/sidebar';
import { MainNav } from '@/components/main-nav';
import Logo from '@/components/logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Notifications } from '@/components/notifications';
import { Cart } from '@/components/cart';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User, LogOut, Shield, Loader2, ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getPlaceholderImage } from '@/lib/placeholder-images';

function UserMenu() {
    const { user, userProfile, isAdmin, logout } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        await logout();
        router.push('/login');
    };

    const displayName = userProfile?.name || user?.displayName || 'Usuario';
    const displayEmail = userProfile?.email || user?.email || '';

    if (!user) {
        return (
            <div className="p-3">
                <div className="flex items-center gap-3 p-3 group-data-[collapsible=icon]:justify-center rounded-md transition-colors bg-sidebar/5">
                    <Avatar className="h-9 w-9 border-2 border-sidebar-accent">
                        <AvatarFallback><Loader2 className="animate-spin" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 flex-col truncate group-data-[collapsible=icon]:hidden space-y-2">
                        <div className="h-4 w-3/4 rounded bg-sidebar/10"></div>
                        <div className="h-3 w-full rounded bg-sidebar/10"></div>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 p-3 group-data-[collapsible=icon]:justify-center hover:bg-sidebar-accent/50 cursor-pointer rounded-md transition-colors">
                    <Avatar className="h-9 w-9 border-2 border-sidebar-accent">
                        <AvatarImage src={getPlaceholderImage(displayName, 40, 40)} alt={displayName} />
                        <AvatarFallback>{displayName?.[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 flex-col truncate group-data-[collapsible=icon]:hidden">
                        <span className="text-sm font-semibold text-sidebar-foreground truncate">{displayName}</span>
                        <span className="text-xs text-sidebar-foreground/70 truncate">{displayEmail}</span>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden" />
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
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Cerrar Sesión</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function AppContentLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    
    return (
        <div className="flex min-h-screen">
            <Sidebar side="left" className="w-64" collapsible="icon">
                <SidebarHeader>
                    <Link href="/" className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
                        <Logo />
                        <span className="font-headline text-lg font-bold group-data-[collapsible=icon]:hidden">EncomiendaYA</span>
                    </Link>
                </SidebarHeader>
                <SidebarContent>
                    <MainNav />
                </SidebarContent>
                <SidebarFooter>
                    {loading ? (
                         <div className="p-3">
                            <div className="flex items-center gap-3 p-3 group-data-[collapsible=icon]:justify-center rounded-md transition-colors">
                                <Loader2 className="h-9 w-9 animate-spin text-sidebar-primary" />
                            </div>
                        </div>
                    ) : user ? (
                        <UserMenu />
                    ) : null}
                </SidebarFooter>
            </Sidebar>
            <SidebarInset>
                <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
                    <SidebarTrigger variant="outline" className="sm:hidden h-9 w-9 rounded-full" />
                    <div className="ml-auto flex items-center gap-2 sm:gap-4">
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
    )
}


export function AppContent({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <AppContentLayout>{children}</AppContentLayout>
        </SidebarProvider>
    );
}
