
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
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Store,
  ClipboardList,
  Shield,
  Truck,
  LayoutGrid,
  Utensils,
  Shirt,
  ShoppingBag,
  ChevronDown,
  Home,
  Package,
  Edit,
  BarChart3,
  Contact,
  Tag,
  Heart,
  LifeBuoy,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/context/auth-context';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';


export function MainNav() {
  const pathname = usePathname();
  const { user, isAdmin, loading } = useAuth();
  const { setOpenMobile } = useSidebar();
  
  const [isAdminOpen, setIsAdminOpen] = React.useState(pathname.startsWith('/admin'));
  const [isMyStoreOpen, setIsMyStoreOpen] = React.useState(pathname.startsWith('/my-store') || pathname.startsWith('/orders') || (user?.role === 'store' && user.storeId && pathname.includes(user.storeId)));
  const [isStoresOpen, setIsStoresOpen] = React.useState(
    pathname.startsWith('/stores') || pathname === '/'
  );

  const isStoreOwner = user?.role === 'store';
  const isDelivery = user?.role === 'delivery';
  
  const isOwnStoreProductsPageActive = isStoreOwner && user?.storeId && pathname === `/stores/${user.storeId}`;
  
  const handleLinkClick = () => {
    if (useSidebar().isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Principal">
          <Link href="/" onClick={handleLinkClick}><Home /><span>Principal</span></Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {/* Buyer & Guest specific menu */}
      {!loading && user?.role === 'buyer' && (
        <>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/orders')} tooltip="Mis Pedidos">
              <Link href="/orders" onClick={handleLinkClick}><ClipboardList /><span>Mis Pedidos</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/favorites')} tooltip="Mis Favoritos">
              <Link href="/favorites" onClick={handleLinkClick}><Heart /><span>Mis Favoritos</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </>
      )}
      
      {!loading && !isStoreOwner && !isDelivery && (
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
                  <Link href="/stores/food" onClick={handleLinkClick}>
                    <Utensils />
                    <span>Comida</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={pathname === '/stores/clothing'}>
                  <Link href="/stores/clothing" onClick={handleLinkClick}>
                    <Shirt />
                    <span>Ropa</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={pathname === '/stores/other'}>
                  <Link href="/stores/other" onClick={handleLinkClick}>
                    <ShoppingBag />
                    <span>Otros</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Store Owner specific menu */}
      {!loading && isStoreOwner && (
        <>
          <Separator className="my-2" />
           <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/orders'} tooltip="Panel">
                <Link href="/orders" onClick={handleLinkClick}>
                  <LayoutGrid />
                  <span>Panel</span>
                </Link>
              </SidebarMenuButton>
          </SidebarMenuItem>

          <Collapsible open={isMyStoreOpen} onOpenChange={setIsMyStoreOpen}>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                 <SidebarMenuButton>
                    <Store />
                    <span>Mi Tienda</span>
                    <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", isMyStoreOpen && "rotate-180")} />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/orders')}>
                      <Link href="/orders" onClick={handleLinkClick}>
                        <ClipboardList />
                        <span>Gestionar Pedidos</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  {user.storeId && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isOwnStoreProductsPageActive}>
                        <Link href={`/stores/${user.storeId}`} onClick={handleLinkClick}>
                          <Package />
                          <span>Gestionar Productos</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                   <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/my-store/categories')}>
                      <Link href="/my-store/categories" onClick={handleLinkClick}>
                        <Tag />
                        <span>Categorías</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                   <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/my-store/analytics')}>
                      <Link href="/my-store/analytics" onClick={handleLinkClick}>
                        <BarChart3 />
                        <span>Analíticas</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                   <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === '/my-store'}>
                      <Link href="/my-store" onClick={handleLinkClick}>
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
            <SidebarMenuButton asChild isActive={pathname === '/orders'} tooltip="Entregas">
              <Link href="/orders" onClick={handleLinkClick}><Truck /><span>Entregas</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/delivery/stats')} tooltip="Mis Estadísticas">
              <Link href="/delivery/stats" onClick={handleLinkClick}><BarChart3 /><span>Mis Estadísticas</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </>
      )}

      <Separator className="my-2" />

       <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname.startsWith('/support')} tooltip="Soporte">
          <Link href="/support" onClick={handleLinkClick}><LifeBuoy /><span>Soporte</span></Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

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
                    <Link href="/admin" onClick={handleLinkClick}>
                      <LayoutGrid />
                      <span>Panel</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                 <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={pathname.startsWith('/admin/stores')}>
                    <Link href="/admin/stores" onClick={handleLinkClick}>
                      <Store />
                      <span>Tiendas</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={pathname.startsWith('/admin/delivery')}>
                    <Link href="/admin/delivery" onClick={handleLinkClick}>
                      <Truck />
                      <span>Reparto</span>
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
