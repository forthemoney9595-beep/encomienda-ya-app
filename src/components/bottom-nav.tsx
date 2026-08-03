'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { useCart } from '@/context/cart-context';
import { Home, ShoppingBag, Heart, User, ShoppingCart } from 'lucide-react';

// Barra de navegación inferior — SOLO en celular (md:hidden). Por ahora solo para
// el rol comprador; tienda/repartidor/admin siguen usando el menú lateral (Sheet)
// hasta sus respectivas fases del rediseño.
export function BottomNav() {
  const pathname = usePathname();
  const { userProfile } = useAuth();
  const { totalItems, setCartSheetOpen } = useCart();

  if (userProfile?.role !== 'buyer') return null;

  const tabs = [
    { href: '/', label: 'Inicio', icon: Home, active: pathname === '/' },
    { href: '/orders', label: 'Pedidos', icon: ShoppingBag, active: pathname.startsWith('/orders') },
    { href: '/favorites', label: 'Favoritos', icon: Heart, active: pathname.startsWith('/favorites') },
    { href: '/profile', label: 'Perfil', icon: User, active: pathname.startsWith('/profile') },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
            tab.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {/* Indicador activo: antes el único cambio era el color del texto y casi no se
              notaba cuál pestaña estaba abierta. */}
          <span
            className={cn(
              'absolute top-0 h-[3px] w-8 rounded-b-full bg-brand-gradient transition-opacity duration-300',
              tab.active ? 'opacity-100' : 'opacity-0',
            )}
          />
          <tab.icon className={cn('h-5 w-5 transition-transform duration-300 ease-spring', tab.active && 'scale-110 fill-primary/15')} />
          {tab.label}
        </Link>
      ))}

      {/* Reemplaza al viejo botón "Más", que solo abría el menú lateral — algo que el
          botón del header ya hace. El carrito, en cambio, antes solo se alcanzaba por el
          ícono chico del header o por la barra flotante dentro de una tienda. */}
      <button
        type="button"
        onClick={() => setCartSheetOpen(true)}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="relative">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {totalItems > 9 ? '9+' : totalItems}
            </span>
          )}
        </span>
        Carrito
      </button>
    </nav>
  );
}
