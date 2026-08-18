'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  Users,
  Wallet,
  Star,
  Shield,
  MessageSquare,
  Bell,
  Settings,
  DollarSign,
  Tag,
  AlertTriangle,
  MessageSquareWarning,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getCategoryStyle, formatCategoryLabel } from '@/lib/category-style';

// Sección colapsable del menú admin -- antes eran 10 links sueltos bajo un solo título
// "Supervisión". El estado abierto/cerrado se guarda en localStorage por sección para que
// no se resetee cada vez que se navega (cada Link es una navegación de página completa).
function NavSection({ id, title, defaultOpen = true, children }: { id: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const storageKey = `admin-nav-section:${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    if (stored !== null) setOpen(stored === 'open');
  }, [storageKey]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="px-3 py-1">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        {title}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const { user, userProfile, loading, isFullAdmin } = useAuth();
  const firestore = useFirestore();

  const isAdminUser = userProfile?.role === 'admin';
  // Invitado (Opción A): sin sesión y sin estar cargando. Ve un menú de exploración.
  const isGuest = !loading && !user;

  // Contadores de pendientes (solo se consultan si es admin).
  // OJO escala: esta consulta corre en CADA página del panel admin. Antes bajaba la
  // colección `users` ENTERA (dominada por compradores, crece sin techo) solo para contar
  // dos badges. Ahora filtra server-side a `isApproved == false`, que devuelve únicamente
  // tiendas/repartidores sin aprobar (un puñado de docs). Como signup/store y signup/delivery
  // siempre setean `isApproved: false` explícito (ver Fase X), el filtro no se pierde ninguno;
  // los rechazados también quedan en false, igual que los contaba el filtro cliente anterior.
  const pendingUsersQuery = useMemoFirebase(
    () => (firestore && isAdminUser ? query(collection(firestore, 'users'), where('isApproved', '==', false)) : null),
    [firestore, isAdminUser]
  );
  const { data: pendingUsers } = useCollection<any>(pendingUsersQuery);

  const withdrawalsQuery = useMemoFirebase(
    () => (firestore && isAdminUser ? query(collection(firestore, 'withdrawals'), where('status', '==', 'pending')) : null),
    [firestore, isAdminUser]
  );
  const { data: pendingWithdrawals } = useCollection<any>(withdrawalsQuery);

  // `status !== 'Rechazado'` (Fase PP): los rechazados también tienen isApproved==false
  // y antes inflaban el badge para siempre.
  const pendingStoresCount = (pendingUsers || []).filter((u: any) => u.role === 'store' && u.status !== 'Rechazado').length;
  const pendingDriversCount = (pendingUsers || []).filter((u: any) => u.role === 'delivery' && u.status !== 'Rechazado').length;
  const pendingWithdrawalsCount = pendingWithdrawals?.length ?? 0;

  // "Explorar Tiendas" (solo comprador): se arma con los rubros REALES de las tiendas
  // aprobadas, no con links hardcodeados. Antes eran 3 links fijos (comida-rapida/Ropa/
  // Otros) que podían llevar a listas vacías o no coincidir con los rubros cargados.
  const isBuyer = userProfile?.role === 'buyer';
  // Solo tiendas aprobadas: filtra server-side (antes traía todas y filtraba en el cliente).
  // La colección `stores` es acotada (pueblo chico), así que el ahorro es menor que el de los
  // usuarios, pero además evita que una tienda sin aprobar aporte su rubro al menú.
  // También para el INVITADO (Opción A): el menú de exploración usa los mismos rubros.
  const storesQuery = useMemoFirebase(
    () => (firestore && (isBuyer || isGuest) ? query(collection(firestore, 'stores'), where('isApproved', '==', true)) : null),
    [firestore, isBuyer, isGuest]
  );
  const { data: buyerStores } = useCollection<any>(storesQuery);
  const buyerCategories = Array.from(
    new Set((buyerStores || [])
      .filter((s: any) => s.category)
      .map((s: any) => s.category as string))
  ).slice(0, 8);

  const NavBadge = ({ count }: { count: number }) => (
    count > 0
      ? <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold h-5 min-w-[20px] px-1.5">{count}</span>
      : null
  );

  // Menú del INVITADO (Opción A): explora la vidriera + CTA de registro. Va antes del
  // guard de abajo porque un invitado no tiene userProfile pero SÍ tiene que ver menú.
  if (isGuest) {
    return (
      <nav className={cn('pb-12 relative', className)} {...props}>
        <div className="space-y-4 py-4">
          <div className="px-3 py-2 space-y-1">
            <Link href="/">
              <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
                <Home className="mr-2 h-4 w-4" /> Inicio
              </Button>
            </Link>
            <Link href="/signup/buyer">
              <Button className="w-full justify-start">
                <ShoppingBag className="mr-2 h-4 w-4" /> Crear cuenta
              </Button>
            </Link>
          </div>
          {buyerCategories.length > 0 && (
            <div className="px-3 py-2">
              <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Explorar Tiendas
              </h2>
              <div className="space-y-1">
                {buyerCategories.map((cat) => {
                  const style = getCategoryStyle(cat);
                  const Icon = style.icon;
                  return (
                    <Link key={cat} href={`/?category=${encodeURIComponent(cat)}`}>
                      <Button variant="ghost" className="w-full justify-start gap-2">
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', style.bg)}>
                          <Icon className={cn('h-3.5 w-3.5', style.text)} />
                        </span>
                        {formatCategoryLabel(cat)}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </nav>
    );
  }

  if (!userProfile) {
    return null;
  }
  
  // 👮‍♂️ ADMIN LINKS — agrupados en secciones colapsables (antes 10 links sueltos bajo
  // un solo título "Supervisión", sin jerarquía ni forma de compactar el menú).
  const renderAdminLinks = () => (
    <>
      <NavSection id="operacion" title="Operación">
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
      </NavSection>

      {/* Finanzas y Pagos / Comunicaciones / Configuración: mueven plata, mandan broadcast
          o cambian config de negocio -- ocultas para admin nivel 'support' (el guard de la
          página también las bloquea si entran por URL directa). Discrepancias de Pago es
          solo revisión/triage (no mueve plata por sí sola), visible a cualquier nivel. */}
      <NavSection id="finanzas" title="Finanzas">
        {isFullAdmin && (
          <Link href="/admin/finances">
            <Button variant={pathname.startsWith('/admin/finances') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <DollarSign className="mr-2 h-4 w-4" />
              Finanzas y Pagos
              <NavBadge count={pendingWithdrawalsCount} />
            </Button>
          </Link>
        )}
        <Link href="/admin/payment-issues">
          <Button variant={pathname.startsWith('/admin/payment-issues') ? 'secondary' : 'ghost'} className="w-full justify-start">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Discrepancias de Pago
          </Button>
        </Link>
      </NavSection>

      <NavSection id="confianza" title="Confianza y Seguridad">
        <Link href="/admin/claims">
          <Button variant={pathname.startsWith('/admin/claims') ? 'secondary' : 'ghost'} className="w-full justify-start">
            <MessageSquareWarning className="mr-2 h-4 w-4" />
            Reclamos de Clientes
          </Button>
        </Link>
        <Link href="/admin/reviews">
          <Button variant={pathname.startsWith('/admin/reviews') ? 'secondary' : 'ghost'} className="w-full justify-start">
            <MessageSquare className="mr-2 h-4 w-4" />
            Moderación Reseñas
          </Button>
        </Link>
        <Link href="/admin/incidents">
          <Button variant={pathname.startsWith('/admin/incidents') ? 'secondary' : 'ghost'} className="w-full justify-start">
            <Shield className="mr-2 h-4 w-4" />
            Incidentes de Repartidor
          </Button>
        </Link>
        <Link href="/admin/audit-log">
          <Button variant={pathname.startsWith('/admin/audit-log') ? 'secondary' : 'ghost'} className="w-full justify-start">
            <Shield className="mr-2 h-4 w-4" />
            Log de Acciones
          </Button>
        </Link>
      </NavSection>

      {isFullAdmin && (
        <NavSection id="comunicacion" title="Comunicación">
          <Link href="/admin/communications">
            <Button variant={pathname.startsWith('/admin/communications') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Bell className="mr-2 h-4 w-4" />
              Comunicaciones
            </Button>
          </Link>
        </NavSection>
      )}

      {isFullAdmin && (
        <NavSection id="sistema" title="Sistema">
          <Link href="/admin/settings">
            <Button variant={pathname.startsWith('/admin/settings') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Settings className="mr-2 h-4 w-4" />
              Configuración
            </Button>
          </Link>
        </NavSection>
      )}

      <div className="px-3 py-2">
        <Link href="/">
          <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
            <Home className="mr-2 h-4 w-4" />
            Ir al Inicio (App)
          </Button>
        </Link>
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
      {renderClientSection()}
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
      {buyerCategories.length > 0 && (
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Explorar Tiendas
          </h2>
          <div className="space-y-1">
            {buyerCategories.map((cat) => {
              const style = getCategoryStyle(cat);
              const Icon = style.icon;
              return (
                <Link key={cat} href={`/?category=${encodeURIComponent(cat)}`}>
                  <Button variant="ghost" className="w-full justify-start gap-2">
                    {/* Ícono con el color del rubro: mismo lenguaje visual que los chips
                        del inicio y los del menú de una tienda (antes era monocromo). */}
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', style.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', style.text)} />
                    </span>
                    {formatCategoryLabel(cat)}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  // 🛒 Sección "Como cliente" — compartida por tienda y repartidor (ago 2026): pueden
  // comprar como cualquier vecino (decisión de producto), con las guardas server-side:
  // la tienda no puede comprarse a sí misma y el repartidor no puede llevar su propio
  // pedido. Sus compras viven en /my-purchases porque /orders es su panel OPERATIVO.
  const renderClientSection = () => (
    <div className="px-3 py-2">
      <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Como cliente
      </h2>
      <div className="space-y-1">
        <Link href="/">
          <Button variant={pathname === '/' ? 'secondary' : 'ghost'} className="w-full justify-start">
            <Home className="mr-2 h-4 w-4" />
            Tiendas
          </Button>
        </Link>
        <Link href="/my-purchases">
          <Button variant={pathname === '/my-purchases' ? 'secondary' : 'ghost'} className="w-full justify-start">
            <ShoppingBag className="mr-2 h-4 w-4" />
            Mis Compras
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
  );

  // 🛵 DELIVERY LINKS (Corregido)
  const renderDeliveryLinks = () => (
    <>
      <div className="px-3 py-2">
        <div className="space-y-1">
          <Link href="/delivery">
            <Button variant={pathname === '/delivery' ? 'secondary' : 'ghost'} className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Mi Panel
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
          <Link href="/delivery/reviews">
            <Button variant={pathname.startsWith('/delivery/reviews') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <Star className="mr-2 h-4 w-4" />
              Mis Reseñas
            </Button>
          </Link>
          <Link href="/delivery/analytics">
            <Button variant={pathname.startsWith('/delivery/analytics') ? 'secondary' : 'ghost'} className="w-full justify-start">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analíticas
            </Button>
          </Link>
        </div>
      </div>
      {renderClientSection()}
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