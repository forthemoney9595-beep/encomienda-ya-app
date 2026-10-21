// Menú FINAL del panel admin (spec "Panel de administración profesional", §a.2, oct 2026).
// Única fuente para el sidebar de escritorio, el drawer y la barra inferior del celular,
// las migas de la topbar y el "Ir a" del ⌘K. Ordenado por lo que se OPERA (lo urgente
// arriba), no por la fase en que se construyó cada pantalla.
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Inbox, ShoppingBag, Store, Bike, UserRound, Landmark, Wallet, Undo2, Scale,
  MessageSquareWarning, Siren, Star, Megaphone, Activity, ScrollText, Settings2,
} from 'lucide-react';

/** Claves de los contadores reales de useAdminCounts (un badge = un count() server-side). */
export type AdminCountKey =
  | 'claimsOpen' | 'mismatchesOpen' | 'incidentsOpen'
  | 'pendingStores' | 'pendingDrivers' | 'withdrawalsPending' | 'inboxTotal';

export interface AdminNavItem {
  href: string;
  label: string;
  /** Etiqueta corta para la barra inferior del celular (si no viene, se usa label). */
  shortLabel?: string;
  icon: LucideIcon;
  /** 'full' = solo admin completo (support no lo ve). */
  level: 'any' | 'full';
  badge?: AdminCountKey;
  /** Pastilla roja = plata/disputas; ámbar = aprobaciones. */
  badgeTone?: 'destructive' | 'warning';
  /** Si no se define, activo = pathname empieza con href. */
  exact?: boolean;
}

export interface AdminNavSection {
  id: string;
  /** Sin título = los ítems sueltos de arriba (Resumen, Bandeja). */
  title?: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    id: 'hoy',
    items: [
      { href: '/admin', label: 'Resumen', icon: LayoutDashboard, level: 'any', exact: true },
      { href: '/admin/inbox', label: 'Bandeja', icon: Inbox, level: 'any', badge: 'inboxTotal', badgeTone: 'destructive' },
    ],
  },
  {
    id: 'operacion',
    title: 'Operación',
    items: [
      { href: '/admin/orders', label: 'Pedidos', icon: ShoppingBag, level: 'any' },
      { href: '/admin/stores', label: 'Tiendas', icon: Store, level: 'any', badge: 'pendingStores', badgeTone: 'warning' },
      { href: '/admin/delivery', label: 'Repartidores', icon: Bike, level: 'any', badge: 'pendingDrivers', badgeTone: 'warning' },
      { href: '/admin/users', label: 'Cuentas', icon: UserRound, level: 'any' },
    ],
  },
  {
    id: 'finanzas',
    title: 'Finanzas',
    items: [
      { href: '/admin/finances', label: 'Resumen financiero', shortLabel: 'Finanzas', icon: Landmark, level: 'full', exact: true },
      { href: '/admin/finances/payouts', label: 'Pagos a cuentas', icon: Wallet, level: 'full', badge: 'withdrawalsPending', badgeTone: 'destructive' },
      { href: '/admin/finances/refunds', label: 'Reembolsos', icon: Undo2, level: 'full' },
      { href: '/admin/payment-issues', label: 'Conciliación MP', icon: Scale, level: 'any', badge: 'mismatchesOpen', badgeTone: 'destructive' },
    ],
  },
  {
    id: 'confianza',
    title: 'Confianza',
    items: [
      { href: '/admin/claims', label: 'Reclamos', icon: MessageSquareWarning, level: 'any', badge: 'claimsOpen', badgeTone: 'destructive' },
      { href: '/admin/incidents', label: 'Incidentes de reparto', shortLabel: 'Incidentes', icon: Siren, level: 'any', badge: 'incidentsOpen', badgeTone: 'destructive' },
      { href: '/admin/reviews', label: 'Reseñas', icon: Star, level: 'any' },
    ],
  },
  {
    id: 'comunicacion',
    title: 'Comunicación',
    items: [
      { href: '/admin/communications', label: 'Avisos', icon: Megaphone, level: 'full' },
    ],
  },
  {
    id: 'sistema',
    title: 'Sistema',
    items: [
      { href: '/admin/system', label: 'Salud del sistema', icon: Activity, level: 'any' },
      { href: '/admin/audit-log', label: 'Auditoría', icon: ScrollText, level: 'any' },
      { href: '/admin/settings', label: 'Configuración', icon: Settings2, level: 'full' },
    ],
  },
];

/** Secciones/ítems visibles para el nivel del admin (lo que support no puede hacer NO se muestra). */
export function visibleAdminNav(isFullAdmin: boolean): AdminNavSection[] {
  return ADMIN_NAV
    .map(s => ({ ...s, items: s.items.filter(i => i.level === 'any' || isFullAdmin) }))
    .filter(s => s.items.length > 0);
}

export function isAdminNavActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href || (item.href === '/admin' && pathname === '/admin/dashboard');
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/** Ítem (y su sección) que corresponde a la ruta actual — alimenta las migas por defecto. */
export function findAdminNav(pathname: string): { section: AdminNavSection; item: AdminNavItem } | null {
  // Los exactos primero: /admin/finances no debe "ganarle" a /admin/finances/payouts.
  const all = ADMIN_NAV.flatMap(s => s.items.map(item => ({ section: s, item })));
  const prefixed = all.filter(x => !x.item.exact && isAdminNavActive(x.item, pathname));
  prefixed.sort((a, b) => b.item.href.length - a.item.href.length);
  if (prefixed[0]) return prefixed[0];
  return all.find(x => x.item.exact && isAdminNavActive(x.item, pathname)) ?? null;
}

/** Barra inferior del celular: lo que se abre 30 veces por día. support ve Reclamos en vez de Finanzas. */
export function adminBottomNav(isFullAdmin: boolean): AdminNavItem[] {
  const resumen = ADMIN_NAV[0].items[0];
  const bandeja = ADMIN_NAV[0].items[1];
  const pedidos = ADMIN_NAV[1].items[0];
  const finanzas = ADMIN_NAV[2].items[0];
  const reclamos = ADMIN_NAV[3].items[0];
  return [resumen, bandeja, pedidos, isFullAdmin ? finanzas : reclamos];
}
