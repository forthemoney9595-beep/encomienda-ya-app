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
  MoreHorizontal,
  Users,
  Wallet // ✅ AÑADIDO: Icono de Billetera
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const { userProfile } = useAuth();
  
  if (!userProfile) {
    return null;
  }
  
  // 👮‍♂️ ADMIN LINKS
  const renderAdminLinks = () => (
    <>
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Supervisión
        </h2>
        <div className="space-y-1">
          <Link href="/admin/dashboard">
            <Button variant={pathname === '/admin/dashboard' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/admin/stores">
            <Button variant={pathname.startsWith('/admin/stores') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Store className="mr-2 h-4 w-4" />
              Gestión Tiendas
            </Button>
          </Link>
          <Link href="/admin/delivery">
            <Button variant={pathname.startsWith('/admin/delivery') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Bike className="mr-2 h-4 w-4" />
              Gestión Repartidores
            </Button>
          </Link>
          <Link href="/admin/users">
            <Button variant={pathname.startsWith('/admin/users') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Users className="mr-2 h-4 w-4" />
              Gestión Usuarios
            </Button>
          </Link>
          <Link href="/">
            <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Home className="mr-2 h-4 w-4" />
              Ir al Inicio (App)
            </Button>
          </Link>
        </div>
      </div>
    </>
  );

  // 🏪 STORE LINKS (Corregido)
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
          <Link href="/my-store">
             <Button variant={pathname === '/my-store' ? 'secondary' : 'ghost'} className="w-full justify-start">
               <Store className="mr-2 h-4 w-4" />
               Mi Tienda
             </Button>
          </Link>
        </div>
      </div>
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Finanzas
        </h2>
        <div className="space-y-1">
          {/* ✅ NUEVO: Enlace a Billetera */}
          <Link href="/my-store/wallet">
            <Button variant={pathname.startsWith('/my-store/wallet') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Wallet className="mr-2 h-4 w-4" />
              Mi Billetera
            </Button>
          </Link>
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

  // 🛒 BUYER LINKS
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

  // 🛵 DELIVERY LINKS (Corregido)
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
              Panel de Entregas
            </Button>
          </Link>
          {/* ✅ CORREGIDO: Apunta a la nueva página de ganancias */}
          <Link href="/delivery/earnings"> 
            <Button variant={pathname.startsWith('/delivery/earnings') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Wallet className="mr-2 h-4 w-4" />
              Mis Ganancias
            </Button>
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <nav className={cn("pb-12 relative", className)} {...props}>
      <div className="space-y-4 py-4 pt-4"> 
        {userProfile.role === 'admin' && renderAdminLinks()}
        {userProfile.role === 'store' && renderStoreLinks()}
        {userProfile.role === 'buyer' && renderBuyerLinks()}
        {userProfile.role === 'delivery' && renderDeliveryLinks()}
      </div>
    </nav>
  );
}