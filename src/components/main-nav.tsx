'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { 
  Home, 
  ShoppingBag, 
  Heart, 
  ListOrdered, 
  BarChart3, 
  Bike, 
  Store,
  Package,
  LayoutDashboard, 
  Utensils,
  Shirt,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
// ❌ ELIMINADO: Importación de Notifications para evitar duplicidad

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const { userProfile } = useAuth();
  
  if (!userProfile) {
    return null;
  }
  
  const renderAdminLinks = () => (
    <>
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Supervisión
        </h2>
        <div className="space-y-1">
          <Link href="/admin/dashboard">
            <Button variant={pathname.startsWith('/admin/dashboard') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Store className="mr-2 h-4 w-4" />
              Ver Tiendas (Home)
            </Button>
          </Link>
        </div>
      </div>
    </>
  );

  const renderStoreLinks = () => (
    <>
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Operaciones
        </h2>
        <div className="space-y-1">
          <Link href="/orders">
            <Button variant={pathname === '/orders' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <ListOrdered className="mr-2 h-4 w-4" />
              Gestionar Pedidos
            </Button>
          </Link>
          <Link href="/my-store/products">
            <Button variant={pathname === '/my-store/products' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Package className="mr-2 h-4 w-4" />
              Gestionar Productos
            </Button>
          </Link>
        </div>
      </div>
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Reportes
        </h2>
        <div className="space-y-1">
          <Link href="/my-store/analytics">
            <Button variant={pathname === '/my-store/analytics' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analíticas
            </Button>
          </Link>
        </div>
      </div>
    </>
  );

  const renderBuyerLinks = () => (
    <>
      <div className="px-3 py-2">
        <div className="space-y-1">
          <Link href="/">
            <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Home className="mr-2 h-4 w-4" />
              Principal
            </Button>
          </Link>
          <Link href="/orders">
            <Button variant={pathname === '/orders' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Mis Pedidos
            </Button>
          </Link>
          <Link href="/favorites">
            <Button variant={pathname === '/favorites' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Heart className="mr-2 h-4 w-4" />
              Mis Favoritos
            </Button>
          </Link>
        </div>
      </div>
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Explorar Tiendas
        </h2>
        <div className="space-y-1">
          <Link href="/?category=comida-rapida">
            <Button variant="ghost" className="w-full justify-start">
                <Utensils className="mr-2 h-4 w-4" />
                Comida Rápida
            </Button>
          </Link>
          <Link href="/?category=Ropa">
            <Button variant="ghost" className="w-full justify-start">
                <Shirt className="mr-2 h-4 w-4" />
                Ropa
            </Button>
          </Link>
          <Link href="/?category=Otros">
            <Button variant="ghost" className="w-full justify-start">
                <MoreHorizontal className="mr-2 h-4 w-4" />
                Otros
            </Button>
          </Link>
        </div>
      </div>
    </>
  );

  const renderDeliveryLinks = () => (
    <>
      <div className="px-3 py-2">
        <div className="space-y-1">
          <Link href="/">
            <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Home className="mr-2 h-4 w-4" />
              Principal
            </Button>
          </Link>
          <Link href="/orders">
            <Button variant={pathname === '/orders' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Bike className="mr-2 h-4 w-4" />
              Entregas
            </Button>
          </Link>
          <Link href="/delivery/earnings"> 
            <Button variant={pathname.startsWith('/delivery/earnings') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <BarChart3 className="mr-2 h-4 w-4" />
              Mis Estadísticas
            </Button>
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <nav className={cn("pb-12 relative", className)} {...props}>
      {/* ❌ ELIMINADO: El div absoluto con la campana duplicada se ha borrado */}

      <div className="space-y-4 py-4 pt-4"> 
        {userProfile.role === 'admin' && renderAdminLinks()}
        {userProfile.role === 'store' && renderStoreLinks()}
        {userProfile.role === 'buyer' && renderBuyerLinks()}
        {userProfile.role === 'delivery' && renderDeliveryLinks()}
      </div>
    </nav>
  );
}