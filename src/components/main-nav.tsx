
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
  MessageCircle,
  ChevronDown,
  Home,
  Package,
  Edit,
  BarChart3,
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
  const isDelivery = user?.role === 'delivery';
  const isBuyer = user?.role === 'buyer' || !user;
  
  const isOwnStorePageActive = isStoreOwner && user?.storeId && pathname.includes(`/stores/${user.storeId}`);


  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Principal">
          <Link href="/"><Home /><span>Principal</span></Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {/* Buyer & Guest specific menu */}
      {!loading && isBuyer && (
        <>
          {user && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/orders')} tooltip="Mis Pedidos">
                  <Link href="/orders"><ClipboardList /><span>Mis Pedidos</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/chat')} tooltip="Chat">
                    <Link href="/chat"><MessageCircle /><span>Chat</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}

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
        </>
      )}

      {/* Store Owner specific menu */}
      {!loading && isStoreOwner && (
        <>
          <Separator className="my-2" />
          <Collapsible open={true} asChild>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                 <SidebarMenuButton>
                    <Store />
                    <span>Mi Tienda</span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform rotate-180" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/orders')}>
                      <Link href="/orders">
                        <ClipboardList />
                        <span>Pedidos</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  {user.storeId && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isOwnStorePageActive}>
                        <Link href={`/stores/${user.storeId}`}>
                          <Package />
                          <span>Productos</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                   <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/admin/my-store/analytics')}>
                      <Link href="/admin/my-store/analytics">
                        <BarChart3 />
                        <span>Analíticas</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                   <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/admin/my-store') && !pathname.startsWith('/admin/my-store/analytics')}>
                      <Link href="/admin/my-store">
                        <Edit />
                        <span>Editar Tienda</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </>
      )}

      {/* Delivery person specific menu */}
      {!loading && isDelivery && (
        <>
         <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/orders')} tooltip="Entregas">
              <Link href="/orders"><Truck /><span>Entregas</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/chat')} tooltip="Chat">
                <Link href="/chat"><MessageCircle /><span>Chat</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </>
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
                  <SidebarMenuSubButton asChild isActive={pathname.startsWith('/admin/delivery')}>
                    <Link href="/admin/delivery">
                      <Truck />
                      <span>Reparto</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                 <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={pathname.startsWith('/admin/my-store')}>
                    <Link href="/admin/my-store">
                      <Store />
                      <span>Mi Tienda</span>
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
