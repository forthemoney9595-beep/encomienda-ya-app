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
  ChevronDown,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CategoryTile } from '@/components/category-tile';
import { formatCategoryLabel } from '@/lib/category-style';

// Menú lateral en vidrio (rediseño 9/11/2026). Cada opción es UN link (antes era un <Button>
// adentro de un <Link>: dos elementos tocables anidados, que el lector de pantalla anunciaba
// dos veces) de 44 px de alto, redondeado, y la opción de la página actual lleva la píldora de
// la marca con aria-current="page". Con el menú de escritorio colapsado a íconos, el texto
// queda solo para el lector de pantalla y los títulos de sección se ocultan.

/** Una opción del menú. `tone` colorea solo el ícono (puertas de negocio del invitado). */
function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge = 0,
  cta,
  iconClassName,
  leading,
}: {
  href: string;
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  /** Botón de acción (crear cuenta): relleno de marca aunque no sea la página actual. */
  cta?: boolean;
  iconClassName?: string;
  /** Reemplaza al ícono (cuadradito del rubro). */
  leading?: React.ReactNode;
}) {
  const filled = active || cta;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={label}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[0.95rem] font-semibold outline-none transition-[background-color,color,box-shadow] duration-200',
        'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
        filled
          ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_hsl(var(--primary)/0.7)]'
          : 'text-sidebar-foreground hover:bg-foreground/[0.06]',
      )}
    >
      {leading ?? (Icon && <Icon className={cn('h-5 w-5 shrink-0', !filled && iconClassName)} aria-hidden="true" />)}
      <span className="min-w-0 flex-1 py-2 leading-tight group-data-[collapsible=icon]:sr-only">{label}</span>
      {badge > 0 && (
        <span
          className={cn(
            'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground',
            'group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:-right-1 group-data-[collapsible=icon]:-top-1 group-data-[collapsible=icon]:h-5 group-data-[collapsible=icon]:min-w-5',
            filled && 'ring-2 ring-primary-foreground/80',
          )}
        >
          {badge}
          <span className="sr-only"> pendientes</span>
        </span>
      )}
    </Link>
  );
}

/** Grupo con título chico (o sin título). */
function NavGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 group-data-[collapsible=icon]:px-1.5">
      {title && (
        <h2 className="mb-1.5 px-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground group-data-[collapsible=icon]:hidden">
          {title}
        </h2>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

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
    <Collapsible open={open} onOpenChange={handleOpenChange} className="px-3 py-1 group-data-[collapsible=icon]:px-1.5">
      <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between rounded-xl px-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden">
        {title}
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
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
  // 'Suspendido' (Fase YY ter) tampoco es una solicitud pendiente.
  const pendingStoresCount = (pendingUsers || []).filter((u: any) => u.role === 'store' && u.status !== 'Rechazado' && u.status !== 'Suspendido').length;
  const pendingDriversCount = (pendingUsers || []).filter((u: any) => u.role === 'delivery' && u.status !== 'Rechazado' && u.status !== 'Suspendido').length;
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

  const is = (p: string) => pathname === p;
  const starts = (p: string) => pathname.startsWith(p);

  // Rubros reales con su cuadradito de color (mismo lenguaje que el inicio).
  const renderExplore = () =>
    buyerCategories.length > 0 && (
      <NavGroup title="Explorar tiendas">
        {buyerCategories.map((cat) => (
          <NavItem
            key={cat}
            href={`/?category=${encodeURIComponent(cat)}`}
            label={formatCategoryLabel(cat)}
            leading={<CategoryTile category={cat} size="sm" className="h-8 w-8 rounded-[0.6rem]" />}
          />
        ))}
      </NavGroup>
    );

  // Menú del INVITADO (Opción A): explora la vidriera + CTA de registro. Va antes del
  // guard de abajo porque un invitado no tiene userProfile pero SÍ tiene que ver menú.
  if (isGuest) {
    return (
      <nav aria-label="Menú principal" className={cn('relative pb-12', className)} {...props}>
        <div className="space-y-3 py-3">
          <NavGroup>
            <NavItem href="/" icon={Home} label="Inicio" active={is('/')} />
            <NavItem href="/signup/buyer" icon={UserPlus} label="Crear cuenta" cta />
          </NavGroup>
          {renderExplore()}
          {/* Puertas de negocio: captación de tiendas y repartidores */}
          <NavGroup title="Para negocios">
            <NavItem href="/signup/store" icon={Store} label="Registrá tu tienda" iconClassName="text-info" />
            <NavItem href="/signup/delivery" icon={Bike} label="Sumate como repartidor" iconClassName="text-warning" />
          </NavGroup>
        </div>
      </nav>
    );
  }

  if (!userProfile) {
    return null;
  }

  // ADMIN — agrupado en secciones colapsables (antes 10 links sueltos bajo un solo título
  // "Supervisión", sin jerarquía ni forma de compactar el menú). Desde la Tanda T1 el admin
  // tiene su propio shell y solo ve este menú si navega la app como cliente.
  const renderAdminLinks = () => (
    <>
      <NavSection id="operacion" title="Operación">
        <NavItem href="/admin" icon={LayoutDashboard} label="Dashboard" active={is('/admin') || is('/admin/dashboard')} />
        <NavItem href="/admin/orders" icon={ShoppingBag} label="Gestión Pedidos" active={starts('/admin/orders')} />
        <NavItem href="/admin/stores" icon={Store} label="Gestión Tiendas" active={starts('/admin/stores')} badge={pendingStoresCount} />
        <NavItem href="/admin/delivery" icon={Bike} label="Gestión Repartidores" active={starts('/admin/delivery')} badge={pendingDriversCount} />
        <NavItem href="/admin/users" icon={Users} label="Gestión Usuarios" active={starts('/admin/users')} />
      </NavSection>

      {/* Finanzas y Pagos / Comunicaciones / Configuración: mueven plata, mandan broadcast
          o cambian config de negocio -- ocultas para admin nivel 'support' (el guard de la
          página también las bloquea si entran por URL directa). Discrepancias de Pago es
          solo revisión/triage (no mueve plata por sí sola), visible a cualquier nivel. */}
      <NavSection id="finanzas" title="Finanzas">
        {isFullAdmin && (
          <NavItem href="/admin/finances" icon={DollarSign} label="Finanzas y Pagos" active={starts('/admin/finances')} badge={pendingWithdrawalsCount} />
        )}
        <NavItem href="/admin/payment-issues" icon={AlertTriangle} label="Discrepancias de Pago" active={starts('/admin/payment-issues')} />
      </NavSection>

      <NavSection id="confianza" title="Confianza y Seguridad">
        <NavItem href="/admin/claims" icon={MessageSquareWarning} label="Reclamos de Clientes" active={starts('/admin/claims')} />
        <NavItem href="/admin/reviews" icon={MessageSquare} label="Moderación Reseñas" active={starts('/admin/reviews')} />
        <NavItem href="/admin/incidents" icon={Shield} label="Incidentes de Repartidor" active={starts('/admin/incidents')} />
        <NavItem href="/admin/audit-log" icon={Shield} label="Log de Acciones" active={starts('/admin/audit-log')} />
      </NavSection>

      {isFullAdmin && (
        <NavSection id="comunicacion" title="Comunicación">
          <NavItem href="/admin/communications" icon={Bell} label="Comunicaciones" active={starts('/admin/communications')} />
        </NavSection>
      )}

      {isFullAdmin && (
        <NavSection id="sistema" title="Sistema">
          <NavItem href="/admin/settings" icon={Settings} label="Configuración" active={starts('/admin/settings')} />
        </NavSection>
      )}

      <NavGroup>
        <NavItem href="/" icon={Home} label="Ir al Inicio (App)" active={is('/')} />
      </NavGroup>
    </>
  );

  // Sección "Como cliente" — compartida por tienda y repartidor (ago 2026): pueden
  // comprar como cualquier vecino (decisión de producto), con las guardas server-side:
  // la tienda no puede comprarse a sí misma y el repartidor no puede llevar su propio
  // pedido. Sus compras viven en /my-purchases porque /orders es su panel OPERATIVO.
  const renderClientSection = () => (
    <NavGroup title="Como cliente">
      <NavItem href="/" icon={Home} label="Tiendas" active={is('/')} />
      <NavItem href="/my-purchases" icon={ShoppingBag} label="Mis Compras" active={is('/my-purchases')} />
      <NavItem href="/favorites" icon={Heart} label="Mis Favoritos" active={is('/favorites')} />
    </NavGroup>
  );

  // TIENDA — "Mi Tienda" (el resumen, a donde lleva el login) va primero, como "Mi Panel"
  // del repartidor.
  const renderStoreLinks = () => (
    <>
      <NavGroup title="Operaciones">
        <NavItem href="/my-store" icon={Store} label="Mi Tienda" active={is('/my-store') || is('/my-store/edit')} />
        <NavItem href="/orders" icon={ListOrdered} label="Gestionar Pedidos" active={is('/orders')} />
        <NavItem href="/my-store/products" icon={Package} label="Gestionar Productos" active={is('/my-store/products')} />
        <NavItem href="/my-store/categories" icon={Tag} label="Categorías" active={is('/my-store/categories')} />
        <NavItem href="/my-store/reviews" icon={Star} label="Reseñas" active={is('/my-store/reviews')} />
      </NavGroup>
      <NavGroup title="Finanzas">
        <NavItem href="/my-store/wallet" icon={Wallet} label="Mi Billetera" active={starts('/my-store/wallet')} />
        <NavItem href="/my-store/analytics" icon={BarChart3} label="Analíticas" active={is('/my-store/analytics')} />
      </NavGroup>
      {renderClientSection()}
    </>
  );

  // COMPRADOR
  const renderBuyerLinks = () => (
    <>
      <NavGroup>
        <NavItem href="/" icon={Home} label="Principal" active={is('/')} />
        <NavItem href="/orders" icon={ShoppingBag} label="Mis Pedidos" active={is('/orders')} />
        <NavItem href="/favorites" icon={Heart} label="Mis Favoritos" active={is('/favorites')} />
      </NavGroup>
      {renderExplore()}
    </>
  );

  // REPARTIDOR
  const renderDeliveryLinks = () => (
    <>
      <NavGroup title="Trabajo">
        <NavItem href="/delivery" icon={LayoutDashboard} label="Mi Panel" active={is('/delivery')} />
        <NavItem href="/orders" icon={Bike} label="Panel de Entregas" active={is('/orders')} />
        <NavItem href="/delivery/earnings" icon={Wallet} label="Mis Ganancias" active={starts('/delivery/earnings')} />
        <NavItem href="/delivery/reviews" icon={Star} label="Mis Reseñas" active={starts('/delivery/reviews')} />
        <NavItem href="/delivery/analytics" icon={BarChart3} label="Analíticas" active={starts('/delivery/analytics')} />
      </NavGroup>
      {renderClientSection()}
    </>
  );

  return (
    <nav aria-label="Menú principal" className={cn('relative pb-12', className)} {...props}>
      <div className="space-y-3 py-3">
        {userProfile.role === 'admin' && renderAdminLinks()}
        {userProfile.role === 'store' && renderStoreLinks()}
        {userProfile.role === 'buyer' && renderBuyerLinks()}
        {userProfile.role === 'delivery' && renderDeliveryLinks()}
      </div>
    </nav>
  );
}
