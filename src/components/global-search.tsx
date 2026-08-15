'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where, limit as fbLimit } from 'firebase/firestore';
import {
  Search, Store as StoreIcon, ShoppingBag, Heart, User, LayoutGrid, Loader2,
  LayoutDashboard, Users, Bike, DollarSign, AlertTriangle, MessageSquare, Shield, Settings, Package,
  Wallet, BarChart3,
} from 'lucide-react';
import { DialogTitle } from '@/components/ui/dialog';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useFirestore } from '@/lib/firebase';
import { useCart } from '@/context/cart-context';
import { useAuth } from '@/context/auth-context';
import { UserDetailDialog } from '@/app/admin/users/user-detail-dialog';
import { getCategoryStyle, formatCategoryLabel } from '@/lib/category-style';
import { cn } from '@/lib/utils';

interface StoreLite {
  id: string;
  name: string;
  category?: string;
  manuallyPaused?: boolean;
  isApproved?: boolean;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABEL: Record<string, string> = { buyer: 'Cliente', store: 'Tienda', delivery: 'Repartidor', admin: 'Admin' };
// Los IDs de documento de Firestore (auto-generados) tienen 20 caracteres -- desde acá
// vale la pena intentar un getDoc directo en vez de gastar una lectura en cada tecla.
const ORDER_ID_MIN_LEN = 15;

/**
 * Buscador global (⌘K / Ctrl+K). Dos modos según el rol de quien lo abre:
 * - Comprador: tiendas, rubros y accesos rápidos (comportamiento original).
 * - Admin: pedido por ID exacto, usuarios (cualquier rol) por prefijo de email, tiendas
 *   (TODAS, no solo aprobadas) por nombre, y accesos directos a cada sección del panel.
 *   Es la respuesta directa a "poder encontrar cualquier cosa en cualquier momento" del
 *   panel admin (Fase FF/GG) -- antes este mismo diálogo estaba montado en /admin/* pero
 *   con contenido 100% de comprador, sin ninguna utilidad ahí.
 */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const { userProfile, isFullAdmin } = useAuth();

  // Cada rol tiene su propio contenido. Antes solo existían dos variantes (comprador y,
  // desde la Fase FF, admin), así que tienda y repartidor caían en la de COMPRADOR: el
  // ⌘K les ofrecía "Mis Favoritos" y "Abrir carrito" y además les bajaba el listado
  // completo de tiendas, una lectura inútil para ellos.
  switch (userProfile?.role) {
    case 'admin':    return <AdminSearch open={open} onOpenChange={onOpenChange} isFullAdmin={isFullAdmin} />;
    case 'store':    return <StoreSearch open={open} onOpenChange={onOpenChange} storeId={userProfile.storeId} />;
    case 'delivery': return <DeliverySearch open={open} onOpenChange={onOpenChange} />;
    default:         return <BuyerSearch open={open} onOpenChange={onOpenChange} />;
  }
}

/**
 * OJO costo (regla de las Fases Y/Z): este diálogo vive en el shell, o sea en TODAS las
 * páginas. Por eso las tiendas se traen con `getDocs` UNA sola vez, recién la primera vez
 * que el usuario abre el buscador, y quedan cacheadas en estado. Un `onSnapshot` acá
 * multiplicaría la lectura de `stores` por cada navegación.
 *
 * A propósito NO busca productos de todas las tiendas: eso necesitaría
 * `collectionGroup('items')`, que es una colección sin techo.
 */
function BuyerSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const firestore = useFirestore();
  const { setCartSheetOpen } = useCart();
  const [stores, setStores] = useState<StoreLite[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Carga perezosa: solo al abrir por primera vez.
  useEffect(() => {
    if (!open || stores !== null || !firestore || loading) return;
    setLoading(true);
    getDocs(query(collection(firestore, 'stores'), where('isApproved', '==', true)))
      .then(snap => setStores(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
      .catch(err => { console.error(err); setStores([]); })
      .finally(() => setLoading(false));
  }, [open, stores, firestore, loading]);

  const go = useCallback((fn: () => void) => { onOpenChange(false); fn(); }, [onOpenChange]);

  const categories = Array.from(new Set((stores || []).map(s => s.category).filter(Boolean))) as string[];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Radix pide un título accesible; el DialogContent de este proyecto no trae uno. */}
      <DialogTitle className="sr-only">Buscar</DialogTitle>
      <CommandInput placeholder="Buscar tiendas, rubros o secciones..." />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando tiendas...
          </div>
        )}
        <CommandEmpty>No encontramos nada con ese nombre.</CommandEmpty>

        {(stores || []).length > 0 && (
          <CommandGroup heading="Tiendas">
            {(stores || []).map(s => {
              const style = getCategoryStyle(s.category || '');
              const Icon = style.icon;
              return (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${s.category || ''}`}
                  onSelect={() => go(() => router.push(`/stores/${s.id}`))}
                >
                  <span className={cn('mr-2 flex h-7 w-7 items-center justify-center rounded-lg', style.bg)}>
                    <Icon className={cn('h-4 w-4', style.text)} />
                  </span>
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.category && <span className="ml-2 text-xs text-muted-foreground">{s.category}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {categories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Rubros">
              {categories.map(cat => {
                const style = getCategoryStyle(cat);
                const Icon = style.icon;
                return (
                  <CommandItem
                    key={cat}
                    value={`rubro ${cat}`}
                    onSelect={() => go(() => router.push(`/?category=${encodeURIComponent(cat)}`))}
                  >
                    <Icon className={cn('mr-2 h-4 w-4', style.text)} />
                    Ver todo en {formatCategoryLabel(cat)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Ir a">
          <CommandItem value="inicio tiendas" onSelect={() => go(() => router.push('/'))}>
            <LayoutGrid className="mr-2 h-4 w-4" /> Inicio
          </CommandItem>
          <CommandItem value="mis pedidos" onSelect={() => go(() => router.push('/orders'))}>
            <ShoppingBag className="mr-2 h-4 w-4" /> Mis Pedidos
          </CommandItem>
          <CommandItem value="favoritos" onSelect={() => go(() => router.push('/favorites'))}>
            <Heart className="mr-2 h-4 w-4" /> Mis Favoritos
          </CommandItem>
          <CommandItem value="perfil cuenta" onSelect={() => go(() => router.push('/profile'))}>
            <User className="mr-2 h-4 w-4" /> Mi Perfil
          </CommandItem>
          <CommandItem value="carrito" onSelect={() => go(() => setCartSheetOpen(true))}>
            <StoreIcon className="mr-2 h-4 w-4" /> Abrir carrito
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function AdminSearch({ open, onOpenChange, isFullAdmin }: GlobalSearchProps & { isFullAdmin: boolean }) {
  const router = useRouter();
  const firestore = useFirestore();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [allStores, setAllStores] = useState<StoreLite[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [orderResult, setOrderResult] = useState<any | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  // Ficha del cliente/admin elegido -- se muestra encima de la página actual.
  const [detailUser, setDetailUser] = useState<any | null>(null);

  // Tiendas: TODAS (a diferencia del modo comprador) -- el admin necesita encontrar
  // también las pendientes de aprobación o pausadas, no solo las públicas. Misma carga
  // perezosa cacheada, `stores` es una colección chica (pueblo chico).
  useEffect(() => {
    if (!open || allStores !== null || !firestore) return;
    getDocs(collection(firestore, 'stores'))
      .then(snap => setAllStores(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => setAllStores([]));
  }, [open, allStores, firestore]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  // Usuarios: Firestore NO sabe buscar por substring, solo por PREFIJO (rango sobre un
  // campo). Por eso escribir "test.com" no encuentra "cliente@test.com" -- hay que empezar
  // por el principio del dato. Se buscan dos campos en paralelo (email y nombre) y se
  // fusionan los resultados, así "david" encuentra por nombre aunque su email no empiece
  // igual. Cubre los 4 roles de una: un repartidor o dueño de tienda también son `users`.
  useEffect(() => {
    if (!firestore || debounced.length < 2) { setUsers(null); return; }
    setLoadingUsers(true);
    const t = debounced.toLowerCase();
    const END = String.fromCharCode(0xf8ff);
    const byEmail = getDocs(query(
      collection(firestore, 'users'),
      where('email', '>=', t), where('email', '<=', t + END), fbLimit(6),
    ));
    // Los rangos de Firestore distinguen mayúsculas ('D' < 'd' en ASCII), así que buscar
    // "david" NO encuentra "David" ni viceversa. Se prueban las dos variantes: tal cual lo
    // escrito y con la primera en mayúscula.
    const capitalized = debounced.charAt(0).toUpperCase() + debounced.slice(1);
    const nameQueries = Array.from(new Set([debounced, capitalized])).map(v => getDocs(query(
      collection(firestore, 'users'),
      where('name', '>=', v), where('name', '<=', v + END), fbLimit(6),
    )));

    Promise.allSettled([byEmail, ...nameQueries])
      .then(results => {
        const map = new Map<string, any>();
        results.forEach(r => {
          if (r.status !== 'fulfilled') return;
          r.value.docs.forEach(d => map.set(d.id, { id: d.id, ...(d.data() as any) }));
        });
        setUsers(Array.from(map.values()).slice(0, 8));
      })
      .finally(() => setLoadingUsers(false));
  }, [firestore, debounced]);

  // Pedido por ID exacto -- el caso de uso más común (alguien pega el ID de un link o de
  // un reclamo). No se busca por nombre de cliente: `orders` no tiene un campo indexado
  // para eso y es una colección sin techo (violaría la regla de escala de las Fases Y/Z);
  // para eso está el filtro de fecha/estado de /admin/orders.
  useEffect(() => {
    if (!firestore || debounced.length < ORDER_ID_MIN_LEN) { setOrderResult(null); return; }
    setLoadingOrder(true);
    getDoc(doc(firestore, 'orders', debounced))
      .then(snap => setOrderResult(snap.exists() ? { id: snap.id, ...snap.data() } : null))
      .catch(() => setOrderResult(null))
      .finally(() => setLoadingOrder(false));
  }, [firestore, debounced]);

  const go = useCallback((fn: () => void) => { onOpenChange(false); fn(); }, [onOpenChange]);

  const matchedStores = useMemo(() => {
    const t = debounced.toLowerCase();
    if (!t || !allStores) return [];
    return allStores.filter(s => s.name?.toLowerCase().includes(t)).slice(0, 8);
  }, [allStores, debounced]);

  // Qué hacer al elegir un usuario. Dueño de tienda y repartidor tienen ficha propia
  // (métricas, CBU, reseñas), así que se navega ahí. Para clientes y admins no existe una
  // página de detalle: se abre el mismo UserDetailDialog de /admin/users (ficha + historial
  // de pedidos) SIN salir de donde estás -- antes navegaba a /admin/users?q=..., que si ya
  // estabas en esa página no se notaba y parecía que el click no hacía nada.
  // OJO: algunos dueños tienen el doc de usuario SIN `storeId` (pasó con tienda@test.com,
  // ver bug de dato en CLAUDE.md). Por eso, si falta, se busca la tienda por `ownerId`
  // dentro de las que este diálogo YA tiene cargadas -- cero lecturas extra.
  const pickUser = (u: any) => {
    if (u.role === 'store') {
      const storeId = u.storeId || (allStores || []).find(s => (s as any).ownerId === u.id)?.id;
      if (storeId) { onOpenChange(false); router.push(`/admin/stores/${storeId}`); return; }
    }
    if (u.role === 'delivery') { onOpenChange(false); router.push(`/admin/delivery/${u.id}`); return; }
    onOpenChange(false);
    setDetailUser(u);
  };

  return (
    <>
    <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} />
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Buscar (panel admin)</DialogTitle>
      <CommandInput value={term} onValueChange={setTerm} placeholder="Pedido (ID), usuario, tienda o sección..." />
      <CommandList>
        {(loadingUsers || loadingOrder) && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
          </div>
        )}
        {/* Firestore solo busca por prefijo, no por substring -- si no se aclara, escribir
            "test.com" y no encontrar nada parece que el buscador está roto. */}
        <CommandEmpty>
          <div className="py-4 px-6 text-center space-y-1">
            <p className="text-sm">No encontramos nada con ese término.</p>
            <p className="text-xs text-muted-foreground">
              La búsqueda es por el <strong>comienzo</strong> del dato: probá con el inicio del
              email (&quot;cliente&quot;), del nombre (&quot;David&quot;) o el ID completo del pedido.
            </p>
          </div>
        </CommandEmpty>

        {orderResult && (
          <CommandGroup heading="Pedido">
            {/* router.push en vez de window.open: un popup puede quedar bloqueado por el
                navegador y el click parecería no hacer nada. */}
            <CommandItem value={`pedido ${orderResult.id}`} onSelect={() => go(() => router.push(`/orders/${orderResult.id}`))}>
              <Package className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">#{orderResult.id.slice(0, 8)} — {orderResult.storeName || 'Tienda'}</span>
              <span className="ml-2 text-xs text-muted-foreground">{orderResult.status}</span>
            </CommandItem>
          </CommandGroup>
        )}

        {matchedStores.length > 0 && (
          <CommandGroup heading="Tiendas">
            {matchedStores.map(s => (
              <CommandItem key={s.id} value={`tienda ${s.name}`} onSelect={() => go(() => router.push(`/admin/stores/${s.id}`))}>
                <StoreIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{s.name}</span>
                {!s.isApproved && <span className="ml-2 text-xs text-warning">Pendiente</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {users && users.length > 0 && (
          <CommandGroup heading="Usuarios">
            {users.map(u => (
              <CommandItem key={u.id} value={`usuario ${u.email} ${u.name || ''}`} onSelect={() => pickUser(u)}>
                <User className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{u.name || u.displayName || u.email}</span>
                  {/* El email es lo que distingue a dos "Cliente Test" -- sin esto no se
                      sabía cuál era cuál en la lista. */}
                  <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                </span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[u.role] || u.role}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Ir a">
          <CommandItem value="dashboard admin panel" onSelect={() => go(() => router.push('/admin'))}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem value="pedidos gestion" onSelect={() => go(() => router.push('/admin/orders'))}>
            <ShoppingBag className="mr-2 h-4 w-4" /> Gestión Pedidos
          </CommandItem>
          <CommandItem value="tiendas gestion" onSelect={() => go(() => router.push('/admin/stores'))}>
            <StoreIcon className="mr-2 h-4 w-4" /> Gestión Tiendas
          </CommandItem>
          <CommandItem value="repartidores gestion" onSelect={() => go(() => router.push('/admin/delivery'))}>
            <Bike className="mr-2 h-4 w-4" /> Gestión Repartidores
          </CommandItem>
          <CommandItem value="usuarios gestion" onSelect={() => go(() => router.push('/admin/users'))}>
            <Users className="mr-2 h-4 w-4" /> Gestión Usuarios
          </CommandItem>
          {isFullAdmin && (
            <CommandItem value="finanzas pagos retiros" onSelect={() => go(() => router.push('/admin/finances'))}>
              <DollarSign className="mr-2 h-4 w-4" /> Finanzas y Pagos
            </CommandItem>
          )}
          <CommandItem value="discrepancias pago mercadopago" onSelect={() => go(() => router.push('/admin/payment-issues'))}>
            <AlertTriangle className="mr-2 h-4 w-4" /> Discrepancias de Pago
          </CommandItem>
          {/* Tanda B: Reclamos y Comunicaciones faltaban del ⌘K (sí estaban en el menú). */}
          <CommandItem value="reclamos clientes" onSelect={() => go(() => router.push('/admin/claims'))}>
            <MessageSquare className="mr-2 h-4 w-4" /> Reclamos de Clientes
          </CommandItem>
          <CommandItem value="incidentes repartidor" onSelect={() => go(() => router.push('/admin/incidents'))}>
            <Shield className="mr-2 h-4 w-4" /> Incidentes de Repartidor
          </CommandItem>
          {isFullAdmin && (
            <CommandItem value="comunicaciones broadcast avisos" onSelect={() => go(() => router.push('/admin/communications'))}>
              <MessageSquare className="mr-2 h-4 w-4" /> Comunicaciones
            </CommandItem>
          )}
          <CommandItem value="resenas moderacion" onSelect={() => go(() => router.push('/admin/reviews'))}>
            <MessageSquare className="mr-2 h-4 w-4" /> Moderación Reseñas
          </CommandItem>
          <CommandItem value="log acciones auditoria" onSelect={() => go(() => router.push('/admin/audit-log'))}>
            <Shield className="mr-2 h-4 w-4" /> Log de Acciones
          </CommandItem>
          {isFullAdmin && (
            <CommandItem value="configuracion settings plataforma" onSelect={() => go(() => router.push('/admin/settings'))}>
              <Settings className="mr-2 h-4 w-4" /> Configuración
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
    </>
  );
}

/**
 * ⌘K del dueño de tienda: busca entre SUS propios productos (para saltar directo a
 * editarlos) + accesos a su panel. Los productos se traen una sola vez al abrir, igual
 * que las tiendas en el modo comprador: es el catálogo de UNA tienda, un set acotado.
 * Lee las dos subcolecciones (`items` actual y `products` legacy) por el mismo motivo que
 * el resto de la app.
 */
function StoreSearch({ open, onOpenChange, storeId }: GlobalSearchProps & { storeId?: string }) {
  const router = useRouter();
  const firestore = useFirestore();
  const [products, setProducts] = useState<any[] | null>(null);

  useEffect(() => {
    if (!open || products !== null || !firestore || !storeId) return;
    Promise.allSettled([
      getDocs(collection(firestore, 'stores', storeId, 'items')),
      getDocs(collection(firestore, 'stores', storeId, 'products')),
    ]).then(results => {
      const all: any[] = [];
      results.forEach(r => {
        if (r.status === 'fulfilled') r.value.docs.forEach(d => all.push({ id: d.id, ...(d.data() as any) }));
      });
      setProducts(all);
    });
  }, [open, products, firestore, storeId]);

  const go = useCallback((fn: () => void) => { onOpenChange(false); fn(); }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Buscar</DialogTitle>
      <CommandInput placeholder="Buscar un producto o una sección..." />
      <CommandList>
        <CommandEmpty>No encontramos nada con ese nombre.</CommandEmpty>

        {(products || []).length > 0 && (
          <CommandGroup heading="Mis productos">
            {(products || []).map(p => (
              <CommandItem key={p.id} value={`producto ${p.name} ${p.category || ''}`} onSelect={() => go(() => router.push('/my-store/products'))}>
                <Package className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{p.name}</span>
                {p.available === false
                  ? <span className="ml-2 text-xs text-destructive">Agotado</span>
                  : <span className="ml-2 text-xs text-muted-foreground">${p.price}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Ir a">
          <CommandItem value="pedidos gestionar" onSelect={() => go(() => router.push('/orders'))}>
            <ShoppingBag className="mr-2 h-4 w-4" /> Gestionar Pedidos
          </CommandItem>
          <CommandItem value="productos catalogo" onSelect={() => go(() => router.push('/my-store/products'))}>
            <Package className="mr-2 h-4 w-4" /> Gestionar Productos
          </CommandItem>
          <CommandItem value="categorias" onSelect={() => go(() => router.push('/my-store/categories'))}>
            <LayoutGrid className="mr-2 h-4 w-4" /> Categorías
          </CommandItem>
          <CommandItem value="mi tienda perfil editar" onSelect={() => go(() => router.push('/my-store'))}>
            <StoreIcon className="mr-2 h-4 w-4" /> Mi Tienda
          </CommandItem>
          <CommandItem value="resenas calificaciones" onSelect={() => go(() => router.push('/my-store/reviews'))}>
            <MessageSquare className="mr-2 h-4 w-4" /> Reseñas
          </CommandItem>
          <CommandItem value="billetera saldo retiros" onSelect={() => go(() => router.push('/my-store/wallet'))}>
            <Wallet className="mr-2 h-4 w-4" /> Mi Billetera
          </CommandItem>
          <CommandItem value="analiticas ventas estadisticas" onSelect={() => go(() => router.push('/my-store/analytics'))}>
            <BarChart3 className="mr-2 h-4 w-4" /> Analíticas
          </CommandItem>
          <CommandItem value="perfil cuenta" onSelect={() => go(() => router.push('/profile'))}>
            <User className="mr-2 h-4 w-4" /> Mi Perfil
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/**
 * ⌘K del repartidor: solo accesos a su panel. A propósito NO busca pedidos -- los que le
 * importan (disponibles y en curso) ya los tiene listados en /orders, y buscar sobre
 * `orders` sería sobre una colección sin techo (regla de escala de las Fases Y/Z).
 */
function DeliverySearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const go = useCallback((fn: () => void) => { onOpenChange(false); fn(); }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Buscar</DialogTitle>
      <CommandInput placeholder="Buscar una sección..." />
      <CommandList>
        <CommandEmpty>No encontramos esa sección.</CommandEmpty>
        <CommandGroup heading="Ir a">
          <CommandItem value="mi panel dashboard resumen" onSelect={() => go(() => router.push('/delivery'))}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Mi Panel
          </CommandItem>
          <CommandItem value="entregas pedidos disponibles en curso" onSelect={() => go(() => router.push('/orders'))}>
            <Bike className="mr-2 h-4 w-4" /> Panel de Entregas
          </CommandItem>
          <CommandItem value="ganancias billetera cobros" onSelect={() => go(() => router.push('/delivery/earnings'))}>
            <Wallet className="mr-2 h-4 w-4" /> Mis Ganancias
          </CommandItem>
          <CommandItem value="resenas calificaciones" onSelect={() => go(() => router.push('/delivery/reviews'))}>
            <MessageSquare className="mr-2 h-4 w-4" /> Mis Reseñas
          </CommandItem>
          <CommandItem value="analiticas estadisticas horas pico" onSelect={() => go(() => router.push('/delivery/analytics'))}>
            <BarChart3 className="mr-2 h-4 w-4" /> Analíticas
          </CommandItem>
          <CommandItem value="perfil cuenta licencia vehiculo" onSelect={() => go(() => router.push('/profile'))}>
            <User className="mr-2 h-4 w-4" /> Mi Perfil
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Atajo de teclado ⌘K / Ctrl+K. Ignora los inputs para no pisar otros buscadores. */
export function useGlobalSearchShortcut(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

/** Botón con pinta de input que abre el buscador (para el header). */
export function GlobalSearchTrigger({ onClick, className }: { onClick: () => void; className?: string }) {
  const { userProfile } = useAuth();
  const placeholder =
    userProfile?.role === 'admin' ? 'Buscar pedido, usuario, tienda...' :
    userProfile?.role === 'store' ? 'Buscar producto o sección...' :
    userProfile?.role === 'delivery' ? 'Buscar sección...' :
    'Buscar tiendas...';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
        className,
      )}
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">{placeholder}</span>
      <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}
