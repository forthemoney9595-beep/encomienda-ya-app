
'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import {
  Store,
  ClipboardList,
  Shield,
  Truck,
  MessageSquareQuote,
  LayoutGrid,
  Utensils,
  Shirt,
  ShoppingBag,
  User,
  MessageCircle,
  ChevronDown,
  Home
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/context/auth-context';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';


export function MainNav() {
  const pathname = usePathname();
  const { user, isAdmin, loading } = useAuth();
  
  const [isAdminOpen, setIsAdminOpen] = React.useState(pathname.startsWith('/admin'));
  const [isStoresOpen, setIsStoresOpen] = React.useState(
    pathname.startsWith('/stores') || pathname === '/'
  );

  const isStoreOwner = user?.role === 'store';

  // For store owners, `/orders` is their main management page.
  // We check if the path starts with `/orders` for the main "Mi Tienda > Pedidos" link.
  // For the user-level "Mis Pedidos", we check for exact match to avoid highlighting both.
  const isStoreOrdersActive = isStoreOwner && pathname.startsWith('/orders');
  const isBuyerOrdersActive = !isStoreOwner && pathname.startsWith('/orders');


  return (
    <SidebarMenu>
       {/* General Navigation */}
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Principal">
          <Link href="/"><Home /><span>Principal</span></Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {/* User Specific Navigation */}
      { !loading && user && (
        <>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/profile')} tooltip="Perfil">
              <Link href="/profile"><User /><span>Mi Perfil</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* "Mis Pedidos" for buyers/delivery/admin shows orders they've placed */}
          {!isStoreOwner &&
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith('/orders')} tooltip="Pedidos">
                <Link href="/orders"><ClipboardList /><span>Mis Pedidos</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          }
          <SidebarMenuItem>
             <SidebarMenuButton asChild isActive={pathname.startsWith('/chat')} tooltip="Chat">
                <Link href="/chat"><MessageCircle /><span>Chat</span></Link>
              </SidebarMenuButton>
          </SidebarMenuItem>
        </>
      )}

      <Separator className="my-2" />

      {/* Store Owner Menu */}
      {isStoreOwner && (
         <Collapsible open={true}>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton>
                <Store />
                <span>Mi Tienda</span>
                <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", "rotate-180")} />
              </SidebarMenuButton>
            </CollapsibleTrigger>
          </SidebarMenuItem>
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={isStoreOrdersActive}>
                  <Link href="/orders">
                    <ClipboardList />
                    <span>Pedidos</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Buyer/Guest Menu */}
      {!isStoreOwner && (
        <Collapsible open={isStoresOpen} onOpenChange={setIsStoresOpen}>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton>
                <Store />
                <span>Explorar Tiendas</span>
                <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", isStoresOpen && "rotate-180")} />
              </SidebarMenuButton>
            </CollapsibleTrigger>
          </SidebarMenuItem>
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={pathname === '/stores/food'}>
                  <Link href="/stores/food">
                    <Utensils />
                    <span>Comida</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={pathname === '/stores/clothing'}>
                  <Link href="/stores/clothing">
                    <Shirt />
                    <span>Ropa</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={pathname === '/stores/other'}>
                  <Link href="/stores/other">
                    <ShoppingBag />
                    <span>Otros</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      )}


      {/* Admin Menu */}
      {!loading && isAdmin && (
        <>
          <Separator className="my-2" />
          <Collapsible open={isAdminOpen} onOpenChange={setIsAdminOpen}>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton>
                  <Shield />
                  <span>Admin</span>
                   <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", isAdminOpen && "rotate-180")} />
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </SidebarMenuItem>
            <CollapsibleContent>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={pathname === '/admin'}>
                    <Link href="/admin">
                      <LayoutGrid />
                      <span>Panel</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={pathname === '/admin/stores'}>
                    <Link href="/admin/stores">
                      <Store />
                      <span>Tiendas</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={pathname === '/admin/delivery'}>
                    <Link href="/admin/delivery">
                      <Truck />
                      <span>Reparto</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={pathname === '/admin/driver-reviews'}>
                    <Link href="/admin/driver-reviews">
                      <MessageSquareQuote />
                      <span>Reseñas</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </SidebarMenu>
  );
}
