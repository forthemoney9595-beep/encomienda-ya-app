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
// Vidrio (9/11/2026): píldora de vidrio FLOTANTE (margen de 0,75rem a los costados y abajo,
// más el área segura del celular). Ocupa 4rem + 0,75rem: el <main> del shell deja pb-28 y la
// barra de carrito de la tienda pública se apoya en 4rem + 1,5rem.
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
    <nav aria-label="Navegación principal" data-testid="bottom-nav" className="glass-bar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex h-16 items-stretch rounded-[1.375rem] px-1 md:hidden">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
            tab.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {/* Indicador activo: antes el único cambio era el color del texto y casi no se
              notaba cuál pestaña estaba abierta. */}
          <span
            className={cn(
              'absolute inset-x-1 inset-y-1.5 rounded-2xl bg-primary/15 transition-opacity duration-200',
              tab.active ? 'opacity-100' : 'opacity-0',
            )}
          />
          <tab.icon className={cn('relative h-5 w-5', tab.active && 'fill-primary/15')} aria-hidden="true" />
          <span className="relative">{tab.label}</span>
        </Link>
      ))}

      {/* Reemplaza al viejo botón "Más", que solo abría el menú lateral — algo que el
          botón del header ya hace. El carrito, en cambio, antes solo se alcanzaba por el
          ícono chico del header o por la barra flotante dentro de una tienda. */}
      <button
        type="button"
        onClick={() => setCartSheetOpen(true)}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="relative">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute -right-2.5 -top-2 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-primary-foreground">
              {totalItems > 9 ? '9+' : totalItems}
            </span>
          )}
        </span>
        Carrito
      </button>
    </nav>
  );
}
