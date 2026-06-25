'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { useSidebar } from '@/components/ui/sidebar';
import { Home, ShoppingBag, Heart, User, Menu } from 'lucide-react';

// Barra de navegación inferior — SOLO en celular (md:hidden). Por ahora solo para
// el rol comprador; tienda/repartidor/admin siguen usando el menú lateral (Sheet)
// hasta sus respectivas fases del rediseño.
export function BottomNav() {
  const pathname = usePathname();
  const { userProfile } = useAuth();
  const { setOpenMobile } = useSidebar();

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
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
            tab.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <tab.icon className={cn('h-5 w-5', tab.active && 'fill-primary/10')} />
          {tab.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
        Más
      </button>
    </nav>
  );
}
