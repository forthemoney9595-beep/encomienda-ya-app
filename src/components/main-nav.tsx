'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where } from 'firebase/firestore';
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
  Wallet,
  Star,
  Shield,
  MessageSquare,
  Bell,
  Settings,
  DollarSign,
  Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const isAdminUser = userProfile?.role === 'admin';

  // Contadores de pendientes (solo se consultan si es admin)
  const usersQuery = useMemoFirebase(
    () => (firestore && isAdminUser ? collection(firestore, 'users') : null),
    [firestore, isAdminUser]
  );
  const { data: allUsers } = useCollection<any>(usersQuery);

  const withdrawalsQuery = useMemoFirebase(
    () => (firestore && isAdminUser ? query(collection(firestore, 'withdrawals'), where('status', '==', 'pending')) : null),
    [firestore, isAdminUser]
  );
  const { data: pendingWithdrawals } = useCollection<any>(withdrawalsQuery);

  const pendingStoresCount = (allUsers || []).filter((u: any) => u.role === 'store' && !u.isApproved).length;
  const pendingDriversCount = (allUsers || []).filter((u: any) => u.role === 'delivery' && !u.isApproved).length;
  const pendingWithdrawalsCount = pendingWithdrawals?.length ?? 0;

  const NavBadge = ({ count }: { count: number }) => (
    count > 0
      ? <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold h-5 min-w-[20px] px-1.5">{count}</span>
      : null
  );

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
          <Link href="/admin">
            <Button variant={pathname === '/admin' || pathname === '/admin/dashboard' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/admin/orders">
            <Button variant={pathname.startsWith('/admin/orders') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Gestión Pedidos
            </Button>
          </Link>
          <Link href="/admin/stores">
            <Button variant={pathname.startsWith('/admin/stores') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Store className="mr-2 h-4 w-4" />
              Gestión Tiendas
              <NavBadge count={pendingStoresCount} />
            </Button>
          </Link>
          <Link href="/admin/delivery">
            <Button variant={pathname.startsWith('/admin/delivery') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Bike className="mr-2 h-4 w-4" />
              Gestión Repartidores
              <NavBadge count={pendingDriversCount} />
            </Button>
          </Link>
          <Link href="/admin/users">
            <Button variant={pathname.startsWith('/admin/users') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Users className="mr-2 h-4 w-4" />
              Gestión Usuarios
            </Button>
          </Link>
          <Link href="/admin/finances">
            <Button variant={pathname.startsWith('/admin/finances') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <DollarSign className="mr-2 h-4 w-4" />
              Finanzas y Pagos
              <NavBadge count={pendingWithdrawalsCount} />
            </Button>
          </Link>
          <Link href="/admin/communications">
            <Button variant={pathname.startsWith('/admin/communications') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Bell className="mr-2 h-4 w-4" />
              Comunicaciones
            </Button>
          </Link>
          <Link href="/admin/reviews">
            <Button variant={pathname.startsWith('/admin/reviews') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <MessageSquare className="mr-2 h-4 w-4" />
              Moderación Reseñas
            </Button>
          </Link>
          <Link href="/admin/audit-log">
            <Button variant={pathname.startsWith('/admin/audit-log') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Shield className="mr-2 h-4 w-4" />
              Log de Acciones
            </Button>
          </Link>
          <Link href="/admin/settings">
            <Button variant={pathname.startsWith('/admin/settings') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Settings className="mr-2 h-4 w-4" />
              Configuración
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
          <Link href="/my-store/categories">
            <Button variant={pathname === '/my-store/categories' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Tag className="mr-2 h-4 w-4" />
              Categorías
            </Button>
          </Link>
          <Link href="/my-store">
             <Button variant={pathname === '/my-store' || pathname === '/my-store/edit' ? 'secondary' : 'ghost'} className="w-full justify-start">
               <Store className="mr-2 h-4 w-4" />
               Mi Tienda
             </Button>
          </Link>
          <Link href="/my-store/reviews">
            <Button variant={pathname === '/my-store/reviews' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Star className="mr-2 h-4 w-4" />
              Reseñas
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