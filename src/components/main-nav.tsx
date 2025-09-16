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
  ShoppingBag
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function MainNav() {
  const pathname = usePathname();
  const [isAdminOpen, setIsAdminOpen] = React.useState(pathname.startsWith('/admin'));
  const [isStoresOpen, setIsStoresOpen] = React.useState(
    pathname.startsWith('/stores') || pathname === '/'
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname === '/'}
          tooltip="Principal"
        >
          <Link href="/">
            <LayoutGrid />
            <span>Principal</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname.startsWith('/orders')}
          tooltip="Pedidos"
        >
          <Link href="/orders">
            <ClipboardList />
            <span>Pedidos</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <Collapsible open={isStoresOpen} onOpenChange={setIsStoresOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton>
              <Store />
              <span>Tiendas</span>
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

      <Collapsible open={isAdminOpen} onOpenChange={setIsAdminOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton>
              <Shield />
              <span>Admin</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent>
          <SidebarMenuSub>
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
                  <span>Reseñas de Conductores</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenu>
  );
}
