'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import {
  ChevronRight, ExternalLink, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, User, ArrowLeft, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { db, useDoc, useMemoFirebase } from '@/lib/firebase';
import { ADMIN_NAV, adminBottomNav, findAdminNav, isAdminNavActive, visibleAdminNav, type AdminNavItem } from '@/lib/admin-nav';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Notifications } from '@/components/notifications';
import { ForegroundPush } from '@/components/foreground-push';
import { GlobalSearch, useGlobalSearchShortcut } from '@/components/global-search';
import Logo from '@/components/logo';
import { AdminCountsProvider, useAdminCounts } from './use-admin-counts';
import { AdminChromeProvider, useAdminChrome } from './admin-chrome';
import { ConfirmProvider } from './confirm-dialog';
import { CountPill } from './status-badge';

const SIDEBAR_KEY = 'admin-sidebar';

/* ───────────────────────── Nav list (sidebar + drawer) ───────────────────────── */

function NavLink({ item, collapsed, onNavigate }: { item: AdminNavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useAdminCounts();
  const active = isAdminNavActive(item, pathname);
  const n = item.badge ? counts.get(item.badge) : null;
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-nav-href={item.href}
      className={cn(
        'relative flex min-h-[36px] items-center gap-2.5 rounded-md px-3 text-sm transition-colors',
        active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-admin-row-hover hover:text-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && <span className="absolute -left-2 top-2 bottom-2 w-[3px] rounded-sm bg-primary" aria-hidden="true" />}
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {item.badge && (
        collapsed
          ? (n && n > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" aria-label={`${n} pendientes`} /> : null)
          : <span className="ml-auto" data-nav-badge={item.badge}><CountPill count={n ?? 0} tone={item.badgeTone} /></span>
      )}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}{n ? ` · ${n}` : ''}</TooltipContent>
    </Tooltip>
  );
}

export function AdminNavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { isFullAdmin } = useAuth();
  const sections = visibleAdminNav(isFullAdmin);
  return (
    <TooltipProvider delayDuration={200}>
      <nav aria-label="Menú del administrador" className={cn('space-y-0.5 px-3 py-2', collapsed && 'px-2')}>
        {sections.map(s => (
          <div key={s.id} className="space-y-0.5">
            {s.title && (
              collapsed
                ? <div className="mx-auto my-2 h-px w-6 bg-border" aria-hidden="true" />
                : <div className="px-3 pb-1 pt-3 text-xs uppercase tracking-wide text-muted-foreground">{s.title}</div>
            )}
            {s.items.map(item => <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

/* ───────────────────────── Topbar pieces ───────────────────────── */

function SystemChip() {
  const { live } = useAdminChrome();
  const ref = useMemoFirebase(() => doc(db, 'config', 'platform'), []);
  const { data } = useDoc<{ maintenanceMode?: boolean }>(ref);
  const maintenance = data?.maintenanceMode === true;
  return (
    <Link
      href="/admin/system"
      data-testid="system-chip"
      data-live={live ? '1' : '0'}
      aria-label={maintenance ? 'Estado del sistema: en mantenimiento' : 'Estado del sistema: en vivo'}
      className={cn(
        'hidden h-9 items-center gap-2 rounded-full px-3 text-sm font-medium sm:inline-flex',
        maintenance ? 'bg-warning/15 text-warning-ink' : 'bg-success/15 text-success-ink',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', maintenance ? 'bg-warning' : 'bg-success', live && !maintenance && 'animate-pulse motion-reduce:animate-none')} aria-hidden="true" />
      {maintenance ? <><Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Mantenimiento</> : 'En vivo'}
    </Link>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    try { setTheme(localStorage.getItem('eya-theme') === 'light' ? 'light' : 'dark'); } catch { /* noop */ }
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('eya-theme', next); } catch { /* noop */ }
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#8B5CF6' : '#F6F5FA');
  };
  return { theme, toggle };
}

function AccountMenu() {
  const { user, userProfile, isFullAdmin } = useAuth();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const name = userProfile?.displayName || userProfile?.name || user?.displayName || 'Admin';
  const level = isFullAdmin ? 'Admin completo' : 'Soporte';
  const signOutNow = async () => {
    try { await signOut(getAuth()); } finally { router.push('/login'); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-1 text-left sm:pr-3" aria-label={`Cuenta: ${name}, ${level}`} data-testid="account-menu">
          <Avatar className="h-7 w-7">
            <AvatarImage src={userProfile?.profileImageUrl || undefined} alt="" />
            <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary-ink">{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-[140px] truncate text-sm">{name}</span>
            <span className="block text-xs text-muted-foreground" data-testid="admin-level">{level}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{userProfile?.email || user?.email}</div>
          <div className="mt-1 text-xs text-muted-foreground">{level}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-[36px] cursor-pointer"><Link href="/profile"><User className="mr-2 h-4 w-4" aria-hidden="true" /> Perfil</Link></DropdownMenuItem>
        <DropdownMenuItem className="min-h-[36px] cursor-pointer" onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" aria-hidden="true" /> : <Moon className="mr-2 h-4 w-4" aria-hidden="true" />}
          {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-[36px] cursor-pointer"><Link href="/"><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Ver la app como cliente</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-[36px] cursor-pointer text-destructive-ink focus:text-destructive-ink" onSelect={(e) => { e.preventDefault(); void signOutNow(); }}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Crumbs() {
  const pathname = usePathname();
  const router = useRouter();
  const { crumbs } = useAdminChrome();
  const found = findAdminNav(pathname);
  const list = crumbs ?? (found ? [...(found.section.title ? [{ label: found.section.title }] : [{ label: 'Hoy' }]), { label: found.item.label, href: found.item.href }] : [{ label: 'Admin' }]);
  const last = list[list.length - 1];
  const isRoot = pathname === '/admin';
  return (
    <>
      {/* Celular: solo el último nivel + volver */}
      <div className="flex min-w-0 items-center gap-1 sm:hidden">
        {!isRoot && (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Volver" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <span className="truncate text-sm font-medium" data-testid="crumb-last">{last?.label}</span>
      </div>
      {/* Escritorio: migas completas */}
      <nav aria-label="Migas de pan" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground sm:flex" data-testid="crumbs">
        {list.map((c, i) => {
          const isLast = i === list.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {c.href && !isLast
                ? <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link>
                : <span className={cn('truncate', isLast && 'font-medium text-foreground')}>{c.label}</span>}
            </span>
          );
        })}
      </nav>
    </>
  );
}

/* ───────────────────────── Shell ───────────────────────── */

function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { isFullAdmin } = useAuth();
  const counts = useAdminCounts();
  const items = adminBottomNav(isFullAdmin);
  return (
    <nav
      aria-label="Navegación principal"
      data-testid="admin-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-border bg-admin-chrome pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(item => {
        const active = isAdminNavActive(item, pathname);
        const n = item.badge ? counts.get(item.badge) : null;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
            className={cn('relative flex min-h-[48px] flex-col items-center justify-center gap-1 text-xs', active ? 'text-primary-ink' : 'text-muted-foreground')}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">{item.shortLabel ?? item.label}</span>
            {n && n > 0 ? <CountPill count={n} tone={item.badgeTone} className="absolute right-3 top-1.5 h-[18px] min-w-[18px] text-[12px]" /> : null}
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="flex min-h-[48px] flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label="Abrir menú completo" data-testid="bottom-more">
        <Menu className="h-5 w-5" aria-hidden="true" /> Más
      </button>
    </nav>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useGlobalSearchShortcut(setSearchOpen);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(SIDEBAR_KEY) === 'collapsed'); } catch { /* noop */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded'); } catch { /* noop */ }
      return next;
    });
  };
  // El drawer se cierra al navegar (y no queda abierto sobre /login al salir).
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  return (
    <div data-surface="admin" className="flex min-h-screen min-w-0 bg-background text-foreground">
      {/* Sidebar escritorio */}
      <aside
        data-testid="admin-sidebar"
        data-collapsed={collapsed ? '1' : '0'}
        className={cn('sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-border bg-admin-chrome transition-[width] duration-200 lg:flex', collapsed ? 'w-16' : 'w-60')}
      >
        <div className={cn('flex h-14 items-center gap-2 border-b border-border px-4', collapsed && 'justify-center px-0')}>
          <Link href="/admin" className="flex items-center gap-2" aria-label="EncomiendaYA · Centro de control">
            <Logo />
            {!collapsed && (
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold">EncomiendaYA</span>
                <span className="block text-xs text-muted-foreground">Centro de control</span>
              </span>
            )}
          </Link>
        </div>
        <AdminNavList collapsed={collapsed} />
        <div className={cn('mt-auto border-t border-border p-3', collapsed && 'p-2')}>
          <Link href="/" className={cn('flex min-h-[36px] items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-admin-row-hover hover:text-foreground', collapsed && 'justify-center px-0')} title="Ver la app como cliente">
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && 'Ver la app como cliente'}
          </Link>
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-admin-chrome/95 px-3 backdrop-blur sm:px-4" data-testid="admin-topbar">
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 lg:hidden" aria-label="Abrir menú" onClick={() => setDrawerOpen(true)} data-testid="open-drawer">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hidden h-9 w-9 shrink-0 lg:inline-flex" aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'} onClick={toggleCollapsed} data-testid="toggle-sidebar">
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </Button>
          <Crumbs />
          <div className="flex-1" />
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar (Ctrl+K)" data-testid="admin-search"
            className="hidden h-9 w-80 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:text-foreground md:flex">
            <Search className="h-4 w-4" aria-hidden="true" /><span className="flex-1 truncate text-left">Buscar pedido, cuenta, tienda…</span>
            <kbd className="rounded border border-border px-1 font-mono text-xs">⌘K</kbd>
          </button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 md:hidden" aria-label="Buscar" onClick={() => setSearchOpen(true)}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </Button>
          <SystemChip />
          <Notifications />
          <AccountMenu />
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>

      {/* Drawer (celular/tablet) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto bg-admin-chrome p-0" data-testid="admin-drawer">
          <SheetHeader className="h-14 justify-center border-b border-border px-4 text-left">
            <SheetTitle className="text-base">Menú</SheetTitle>
          </SheetHeader>
          <AdminNavList onNavigate={() => setDrawerOpen(false)} />
          <div className="border-t border-border p-3">
            <Link href="/" className="flex min-h-[36px] items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-admin-row-hover hover:text-foreground">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver la app como cliente
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      <BottomNav onMore={() => setDrawerOpen(true)} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ForegroundPush />
    </div>
  );
}

/** Shell del panel admin: sidebar 240/64, topbar, drawer y barra inferior, con los providers de contadores/migas/confirmación. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminCountsProvider>
      <AdminChromeProvider>
        <ConfirmProvider>
          <ShellInner>{children}</ShellInner>
        </ConfirmProvider>
      </AdminChromeProvider>
    </AdminCountsProvider>
  );
}

export { ADMIN_NAV };
