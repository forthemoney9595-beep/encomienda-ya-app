'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useCountFromServer } from '@/lib/firebase-aggregate';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, documentId,
  doc, serverTimestamp, deleteField, writeBatch, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, MoreHorizontal, Shield, Trash2, Users, Eye, Store, Bike, ChevronDown, MailCheck, MailWarning, Phone } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import AdminAuthGuard from '../admin-auth-guard';
import { logAdminAction } from '@/lib/admin-audit';
import { UserDetailDialog } from './user-detail-dialog';
import { AdminPage } from '@/components/admin/admin-page';
import { GlassSearch, ListCard, ListGroupHeader, ListRow, PersonTile, RowIconButton, SlidingChips } from '@/components/admin/admin-list';
import { SOFT_BADGE } from '@/components/admin/status-badge';
import { EmptyState } from '@/components/admin/empty-state';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { fetchUsersForSearch, userMatchesSearch, invalidateUserSearchCache, ADMIN_SEARCH_CAP } from '@/lib/admin-user-search';

const PAGE_SIZE = 25;

// Identidad visual por rol (18/8): mismo lenguaje de color del resto del panel —
// azul/info = tienda, ámbar/warning = repartidor, violeta/primary = admin. En "Todos"
// la tabla se agrupa en secciones colapsables por rol.
const ROLE_GROUPS = [
  { k: 'buyer',    label: 'Clientes',     icon: Users,  text: 'text-foreground',  border: 'border-l-border',  ring: 'border-border',     chip: 'bg-foreground text-background' },
  { k: 'store',    label: 'Tiendas',      icon: Store,  text: 'text-info',        border: 'border-l-info',    ring: 'border-info/50',    chip: 'bg-info text-info-foreground' },
  { k: 'delivery', label: 'Repartidores', icon: Bike,   text: 'text-warning',     border: 'border-l-warning', ring: 'border-warning/50', chip: 'bg-warning text-warning-foreground' },
  { k: 'admin',    label: 'Admins',       icon: Shield, text: 'text-primary',     border: 'border-l-primary', ring: 'border-primary/50', chip: 'bg-primary text-primary-foreground' },
] as const;
const groupOf = (role?: string) => ROLE_GROUPS.find(g => g.k === (role || 'buyer')) || ROLE_GROUPS[0];

function AdminUsersPage() {
  const { user: currentUser, isFullAdmin } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q') || '';
  // Precarga desde la búsqueda global admin (⌘K) -- ej. tocar un cliente ahí navega acá
  // con ?q=email@ejemplo.com en vez de dejar al admin escribirlo de nuevo a mano.
  const [search, setSearch] = useState(qParam);
  const [debouncedSearch, setDebouncedSearch] = useState(qParam.trim().toLowerCase());
  const [roleFilter, setRoleFilter] = useState<'all' | 'buyer' | 'store' | 'delivery' | 'admin'>('all');
  const [detailUser, setDetailUser] = useState<any | null>(null);
  // Secciones colapsables de la vista "Todos" (arrancan todas abiertas).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Lista paginada (getDocs + cursor). No usamos useCollection porque necesitamos el snapshot
  // del último doc para startAfter, y el hook compartido lo descarta.
  const [rows, setRows] = useState<any[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchCapped, setSearchCapped] = useState(false);

  // Conteos por rol vía aggregation server-side (antes se contaban bajando TODA la colección).
  const allCountQ      = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
  const buyerCountQ    = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'buyer')) : null, [firestore]);
  const storeCountQ    = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'store')) : null, [firestore]);
  const deliveryCountQ = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'delivery')) : null, [firestore]);
  const adminCountQ    = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '==', 'admin')) : null, [firestore]);
  const { count: cAll, refresh: rAll }           = useCountFromServer(allCountQ, { refreshOnFocus: true });
  const { count: cBuyer, refresh: rBuyer }       = useCountFromServer(buyerCountQ, { refreshOnFocus: true });
  const { count: cStore, refresh: rStore }       = useCountFromServer(storeCountQ, { refreshOnFocus: true });
  const { count: cDelivery, refresh: rDelivery } = useCountFromServer(deliveryCountQ, { refreshOnFocus: true });
  const { count: cAdmin, refresh: rAdmin }       = useCountFromServer(adminCountQ, { refreshOnFocus: true });
  const roleCounts = {
    all: cAll ?? 0, buyer: cBuyer ?? 0, store: cStore ?? 0, delivery: cDelivery ?? 0, admin: cAdmin ?? 0,
  };
  const refreshCounts = () => { rAll(); rBuyer(); rStore(); rDelivery(); rAdmin(); };

  // ✉️ Mail verificado por usuario (punto 1 de la prueba, 18/8): el dato vive en Firebase
  // Auth — se pide a la API admin para las filas cargadas. Ayuda a que ninguna verificación
  // falle: se ve de un vistazo quién confirmó su correo.
  const [emailVerified, setEmailVerified] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!currentUser || rows.length === 0) return;
    const uids = rows.map(r => r.id).filter(id => emailVerified[id] === undefined);
    if (uids.length === 0) return;
    let cancelled = false;
    currentUser.getIdToken()
      .then(token => fetch('/api/admin/email-verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uids }),
      }))
      .then(res => res.json())
      .then(data => { if (!cancelled && data.verified) setEmailVerified(prev => ({ ...prev, ...data.verified })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser, rows, emailVerified]);

  // Mapa dueño → tienda (18/8): las filas de rol Tienda mostraban solo a la PERSONA — no
  // se sabía cuál tienda era de quién ni había camino a la ficha de la tienda (pedidos/
  // plata/CBU en /admin/stores/[id]). `stores` es una colección chica por diseño (pueblo),
  // un getDocs one-shot no viola la regla de escala de las Fases Y/Z.
  const [storeByOwner, setStoreByOwner] = useState<Record<string, { id: string; name: string }>>({});
  useEffect(() => {
    if (!firestore) return;
    getDocs(collection(firestore, 'stores')).then(snap => {
      const map: Record<string, { id: string; name: string }> = {};
      snap.docs.forEach(d => {
        const s = d.data() as any;
        const owner = s.ownerId || s.userId;
        if (owner) map[owner] = { id: d.id, name: s.name || 'Tienda' };
      });
      setStoreByOwner(map);
    }).catch(() => { /* la columna extra simplemente no se muestra */ });
  }, [firestore]);

  // Si el ⌘K navega acá estando YA en esta página, la ruta no cambia (solo el query param)
  // y el componente no se re-monta -- sin esto el buscador quedaba con el valor viejo y
  // parecía que el resultado del ⌘K "no llevaba a ningún lado".
  useEffect(() => {
    if (qParam) { setSearch(qParam); setRoleFilter('all'); }
  }, [qParam]);

  // Debounce del buscador.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Arma la query de NAVEGACIÓN (sin término de búsqueda): filtro por rol o todos,
  // paginado por cursor. La búsqueda ya NO usa query de Firestore — ver resetLoad.
  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const col = collection(firestore, 'users');
    const cons: any[] = [];
    if (roleFilter !== 'all') {
      cons.push(where('role', '==', roleFilter), orderBy(documentId()));
    } else {
      cons.push(orderBy(documentId()));
    }
    cons.push(limit(PAGE_SIZE));
    if (cursor) cons.push(startAfter(cursor));
    return query(col, ...cons);
  }, [firestore, roleFilter]);

  const resetLoad = useCallback(async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      if (debouncedSearch) {
        // Búsqueda TOTAL (18/8): nombre, email, teléfono y DNI/CUIT — substring y sin
        // acentos, así "luis" encuentra a "jorge luis". Reemplaza al viejo prefijo de
        // email server-side, que solo encontraba lo que EMPEZABA igual. Baja la
        // colección una vez con caché y tope (ver admin-user-search.ts).
        const { users, capped } = await fetchUsersForSearch(firestore);
        setSearchCapped(capped);
        setRows(users
          .filter(u => userMatchesSearch(u, debouncedSearch))
          .sort((a, b) => (a.name || a.displayName || '').localeCompare(b.name || b.displayName || '')));
        setLastSnap(null);
        setHasMore(false);
      } else {
        const q = buildQuery(null);
        if (!q) return;
        const snap = await getDocs(q);
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLastSnap(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      }
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error al cargar usuarios' });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, debouncedSearch, buildQuery, toast]);

  useEffect(() => { resetLoad(); }, [resetLoad]);

  const loadMore = async () => {
    const q = buildQuery(lastSnap);
    if (!q || !lastSnap) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(q);
      setRows(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastSnap(snap.docs[snap.docs.length - 1] || lastSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // En modo búsqueda el filtro por rol se aplica en cliente sobre la página traída (evita un
  // índice compuesto email+role). En modo navegación la query ya filtra por rol.
  const displayed = (debouncedSearch && roleFilter !== 'all')
    ? rows.filter(u => u.role === roleFilter)
    : rows;

  // --- ACCIONES ---

  const handleRoleChange = async (userId: string, newRole: string, oldRole: string, level: 'full' | 'support' = 'full') => {
    if (!firestore) return;

    const promotingToAdmin = newRole === 'admin' && oldRole !== 'admin';
    const demotingFromAdmin = oldRole === 'admin' && newRole !== 'admin';

    // Otorgar/quitar admin requiere ser admin 'full' (firestore.rules lo exige igual —
    // esto es solo para no dejar que un 'support' intente y se lleve un permission-denied
    // confuso, o peor, deje al usuario con role:'admin' en su perfil pero sin acceso real
    // porque roles_admin no se pudo escribir — el mismo tipo de desincronización que ya
    // mordió una vez en la Fase R).
    // Fase PP-P3: CUALQUIER cambio de rol exige admin completo (antes solo los de admin —
    // un 'support' podía convertir compradores en tiendas/repartidores). La regla de
    // Firestore ahora también lo exige; esto evita el botón que siempre falla.
    if (!isFullAdmin) {
        toast({ variant: 'destructive', title: 'No autorizado', description: 'Cambiar roles requiere acceso completo de administrador.' });
        return;
    }

    // Decisión de producto: una cuenta es tienda O repartidor, nunca las dos cosas. Quien
    // quiera hacer ambas se crea una cuenta aparte. Convertir en repartidor al dueño de una
    // tienda lo dejaría tomando pedidos de la competencia con la misma cuenta con la que
    // vende, y le partiría el circuito de cobro en dos (el saldo de tienda sale de
    // `stores.ownerId`, el de repartidor de `orders.deliveryPersonId`).
    if (newRole === 'delivery') {
        const ownsStore = await getDocs(query(
            collection(firestore, 'stores'), where('ownerId', '==', userId), limit(1)));
        if (!ownsStore.empty) {
            toast({
                variant: 'destructive',
                title: 'Esta cuenta tiene una tienda',
                description: `Es dueña de "${ownsStore.docs[0].data().name || 'una tienda'}". Una cuenta no puede vender y repartir a la vez — que se cree una cuenta aparte de repartidor.`,
            });
            return;
        }
    }

    const confirmMessage = promotingToAdmin
        ? `Le vas a dar acceso de administrador ${level === 'full' ? 'TOTAL' : 'de SOPORTE (operativo, sin plata/config/broadcast)'} a este usuario. ¿Confirmás?`
        : demotingFromAdmin
        ? '¿Confirmás quitarle el acceso de administrador a este usuario?'
        : `¿Estás seguro de cambiar el rol de este usuario a ${newRole}?`;

    if (!(await confirmDialog({ title: confirmMessage, tone: demotingFromAdmin ? 'destructive' : 'default', confirmLabel: 'Confirmar' })).ok) return;

    try {
        // role en users/{uid} es lo que decide la UI del lado del cliente,
        // pero el acceso real a datos sensibles depende de roles_admin/{uid}
        // (asi lo exige firestore.rules) — hay que mantener los dos en sync.
        // BATCH ATÓMICO (Fase PP-P4): antes eran dos writes sueltos — si el segundo
        // fallaba, quedaba un "admin" fantasma (role sin roles_admin) o al revés.
        const batch = writeBatch(firestore);
        batch.update(doc(firestore, 'users', userId), {
            role: newRole,
            ...(promotingToAdmin ? { adminLevel: level } : {}),
            ...(demotingFromAdmin ? { adminLevel: deleteField() } : {}),
        });
        if (promotingToAdmin) {
            batch.set(doc(firestore, 'roles_admin', userId), { role: 'admin', level, createdAt: serverTimestamp() });
        } else if (demotingFromAdmin) {
            batch.delete(doc(firestore, 'roles_admin', userId));
        }
        await batch.commit();

        toast({ title: 'Rol actualizado', description: `El usuario ahora es ${newRole}${promotingToAdmin ? ` (${level === 'full' ? 'completo' : 'soporte'})` : ''}.` });
        if (firestore && currentUser) logAdminAction(firestore, currentUser.uid, 'change_role', userId, `${oldRole} → ${newRole}${promotingToAdmin ? ` (${level})` : ''}`);
        invalidateUserSearchCache(); resetLoad();
        refreshCounts();
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al cambiar rol' });
    }
  };

  // Cambiar el nivel de un admin YA existente (full <-> support) sin pasar por todo el
  // ciclo de demote/promote.
  const handleLevelChange = async (userId: string, newLevel: 'full' | 'support') => {
    if (!firestore) return;
    if (!isFullAdmin) {
        toast({ variant: 'destructive', title: 'No autorizado', description: 'Necesitás acceso completo de administrador para esto.' });
        return;
    }
    if (!(await confirmDialog({
        title: newLevel === 'support'
          ? '¿Bajar a este admin a nivel Soporte (sin plata/config/broadcast/borrar cuentas)?'
          : '¿Darle a este admin acceso TOTAL?',
        confirmLabel: 'Confirmar',
    })).ok) return;

    try {
        // Batch atómico (Fase PP-P4): la UI (users.adminLevel) y el acceso real
        // (roles_admin.level) no pueden quedar discrepando por un write fallido.
        const batch = writeBatch(firestore);
        batch.update(doc(firestore, 'users', userId), { adminLevel: newLevel });
        batch.update(doc(firestore, 'roles_admin', userId), { level: newLevel });
        await batch.commit();
        toast({ title: 'Nivel actualizado', description: `Ahora es admin ${newLevel === 'full' ? 'completo' : 'de soporte'}.` });
        if (currentUser) logAdminAction(firestore, currentUser.uid, 'change_admin_level', userId, newLevel);
        invalidateUserSearchCache(); resetLoad();
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al cambiar nivel' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!currentUser) return;
    // La API igual lo rechaza (403) si no es 'full' -- esto solo evita el viaje redondo.
    if (!isFullAdmin) {
        toast({ variant: 'destructive', title: 'No autorizado', description: 'Necesitás acceso completo de administrador para esto.' });
        return;
    }
    if (!(await confirmDialog({ title: '¿Eliminar la cuenta?', description: 'Se borra permanentemente (Firebase Auth + Firestore). No se puede deshacer.', tone: 'destructive', confirmLabel: 'Eliminar cuenta' })).ok) return;

    try {
        let res = await authedFetch('/api/admin/delete-user', currentUser, { userId });
        let data = await res.json();
        // 409 = la cuenta tiene plata sin cobrar (ver /api/admin/delete-user).
        if (res.status === 409 && data.needsForce) {
            if (!(await confirmDialog({ title: '¿Borrar igual?', description: `${data.error} La deuda se pierde y queda registrada en el log.`, tone: 'destructive', confirmLabel: 'Borrar igual' })).ok) return;
            res = await authedFetch('/api/admin/delete-user', currentUser, { userId, force: true });
            data = await res.json();
        }
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');
        toast({ title: 'Usuario eliminado', description: 'La cuenta fue borrada de Auth y Firestore.' });
        // La auditoria la escribe la propia API (admin-audit-server).
        invalidateUserSearchCache(); resetLoad();
        refreshCounts();
    } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    }
  };

  const roleLabel = (r?: string) => r === 'store' ? 'Tienda' : r === 'delivery' ? 'Repartidor' : r === 'admin' ? 'Admin' : 'Cliente';
  const storeOf = (u: any) => storeByOwner[u.id] || (u.storeId ? Object.values(storeByOwner).find(s => s.id === u.storeId) : undefined);

  const renderUserRow = (user: any, i: number) => {
    const store = user.role === 'store' ? storeOf(user) : undefined;
    const approvalTone = user.isApproved ? 'success' : user.status === 'Suspendido' ? 'destructive' : 'warning';
    const approvalLabel = user.isApproved ? 'Aprobado' : user.status === 'Suspendido' ? 'Suspendido' : 'Pendiente';
    const who = user.displayName || user.name || user.email || 'la cuenta';
    return (
      <ListRow
        key={user.id}
        index={i}
        testId="user-row"
        leading={<PersonTile role={user.role} photo={user.photoURL || user.profileImageUrl} />}
        title={user.displayName || user.name || 'Sin nombre'}
        subtitle={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate">{user.email}</span>
            {/* Estado del mail como etiqueta propia, bien visible (punto 1 de la prueba). */}
            {emailVerified[user.id] === true && (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-success/15 px-2 text-xs font-semibold text-[hsl(142_80%_20%)] dark:text-success-ink"><MailCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mail verificado</span>
            )}
            {emailVerified[user.id] === false && (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-warning/15 px-2 text-xs font-semibold text-warning-ink"><MailWarning className="h-3.5 w-3.5" aria-hidden="true" /> Mail sin verificar</span>
            )}
          </span>
        }
        meta={
          <>
            <span className="flex flex-wrap justify-end gap-1">
              <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold', user.role === 'admin' ? 'bg-primary/15 text-primary-ink' : 'bg-muted text-foreground')} data-testid="user-role">{roleLabel(user.role)}</span>
              {user.role === 'admin' && <span className="inline-flex h-[22px] items-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">{user.adminLevel === 'support' ? 'Soporte' : 'Completo'}</span>}
            </span>
            {(user.role === 'store' || user.role === 'delivery') && (
              <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold', SOFT_BADGE[approvalTone])}>{approvalLabel}</span>
            )}
          </>
        }
        actions={
          <>
            {/* Ficha COMPLETA del negocio (pedidos, plata, CBU): el ojito muestra a la persona. */}
            {store && <RowIconButton label={`Ficha de ${store.name}`} href={`/admin/stores/${store.id}`}><Store className="h-4 w-4" aria-hidden="true" /></RowIconButton>}
            {user.role === 'delivery' && <RowIconButton label="Ficha del repartidor" href={`/admin/delivery/${user.id}`}><Bike className="h-4 w-4" aria-hidden="true" /></RowIconButton>}
            <RowIconButton label="Ver detalle de la persona" onClick={() => setDetailUser(user)}><Eye className="h-4 w-4" aria-hidden="true" /></RowIconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground" aria-label={`Más acciones para ${who}`}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Cambiar rol</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'buyer', user.role)}>Convertir en Cliente</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'store', user.role)}>Convertir en Tienda</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'delivery', user.role)}>Convertir en Repartidor</DropdownMenuItem>
                {/* Otorgar/quitar admin y cambiar nivel: solo admin 'full' (ver isFullAdmin) --
                    firestore.rules lo exige igual, pero ocultarlo evita que un 'support' lo
                    intente y deje al usuario en un estado a medias (role sin roles_admin real). */}
                {isFullAdmin && user.role === 'admin' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Nivel de admin</DropdownMenuLabel>
                    {user.adminLevel === 'support' ? (
                      <DropdownMenuItem onClick={() => handleLevelChange(user.id, 'full')}>Dar acceso completo</DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleLevelChange(user.id, 'support')}>Bajar a Soporte</DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleRoleChange(user.id, 'buyer', user.role)}>
                      Quitar acceso de Admin
                    </DropdownMenuItem>
                  </>
                )}
                {isFullAdmin && user.role !== 'admin' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-primary font-bold focus:text-primary focus:bg-primary/10" onClick={() => handleRoleChange(user.id, 'admin', user.role, 'full')}>
                      <Shield className="mr-2 h-4 w-4" /> Hacer Admin (completo)
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-primary focus:text-primary focus:bg-primary/10" onClick={() => handleRoleChange(user.id, 'admin', user.role, 'support')}>
                      <Shield className="mr-2 h-4 w-4" /> Hacer Admin (soporte)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {isFullAdmin && user.id !== currentUser?.uid && (
              <RowIconButton label="Eliminar usuario" tone="destructive" onClick={() => handleDeleteUser(user.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /></RowIconButton>
            )}
          </>
        }
      >
        {/* Info específica del rol, para distinguir de un vistazo */}
        {user.phoneNumber && (user.role === 'buyer' || user.role === 'store') && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" aria-hidden="true" /> {user.phoneNumber}</div>
        )}
        {user.role === 'delivery' && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', user.isOnline !== false ? 'bg-success' : 'bg-muted-foreground/60')} aria-hidden="true" />
              {user.isOnline !== false ? 'Disponible' : 'No disponible'}
            </span>
            {(() => {
              const v = user.vehicle;
              const txt = typeof v === 'string' ? v : v?.type ? `${v.type}${v.plate ? ' · ' + v.plate : ''}` : null;
              return txt ? <span className="capitalize">· {txt}</span> : null;
            })()}
          </div>
        )}
        {/* Qué tienda es de esta persona — antes solo se veía a la PERSONA */}
        {store && (
          <Link href={`/admin/stores/${store.id}`} className="mt-0.5 inline-flex min-h-[24px] items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
            <Store className="h-3 w-3" aria-hidden="true" /> {store.name}
          </Link>
        )}
        {/* En celular angosto la columna derecha se esconde: rol debajo. */}
        <span className="mt-1 inline-flex h-[22px] items-center rounded-full bg-muted px-2 text-xs font-semibold min-[380px]:hidden">{roleLabel(user.role)}</span>
      </ListRow>
    );
  };

  return (
    <AdminPage
      title="Cuentas"
      subtitle={<span data-testid="users-kline"><b className="tabular-nums text-foreground">{cAll === null ? '…' : roleCounts.all.toLocaleString('es-AR')}</b> cuentas en la base · clientes, tiendas, repartidores y admins</span>}
    >
      <div className="space-y-3">
        <GlassSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, email, teléfono o DNI"
          label="Buscar cuentas"
          testId="users-search"
          hint={debouncedSearch && !isLoading ? (
            <>
              {displayed.length} resultado{displayed.length === 1 ? '' : 's'} para «{search.trim()}» en toda la base
              {searchCapped && ` — la base superó los ${ADMIN_SEARCH_CAP.toLocaleString('es-AR')} usuarios, la búsqueda puede estar incompleta (avisar a Claude: toca migrar a un índice de búsqueda)`}
            </>
          ) : 'Busca en toda la base (nombre o email por partes, teléfono o DNI/CUIT).'}
        />
        <SlidingChips
          chips={[
            { value: 'all', label: 'Todos', icon: Users, count: cAll === null ? null : roleCounts.all },
            ...ROLE_GROUPS.map(g => ({ value: g.k, label: g.label, icon: g.icon, count: roleCounts[g.k] })),
          ]}
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as typeof roleFilter)}
          label="Filtrar cuentas por rol"
          testId="users-chips"
        />
      </div>

      <ListCard testId="users-list">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando cuentas" /></div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debouncedSearch ? `No se encontraron cuentas para «${debouncedSearch}»` : 'No hay cuentas para mostrar'}
            description={debouncedSearch ? 'Busca por nombre, email, teléfono o DNI.' : undefined}
          />
        ) : roleFilter !== 'all' ? (
          // Con un rol filtrado, lista plana; en "Todos", secciones colapsables por rol.
          displayed.map(renderUserRow)
        ) : (
          ROLE_GROUPS.map(g => {
            const groupRows = displayed.filter(u => (u.role || 'buyer') === g.k);
            if (groupRows.length === 0) return null;
            const collapsed = collapsedGroups.has(g.k);
            const Icon = g.icon;
            return (
              <Fragment key={g.k}>
                <ListGroupHeader onClick={() => toggleGroup(g.k)} expanded={!collapsed} className="border-t border-foreground/10 first:border-t-0">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-foreground">{g.label}</span>
                  <span className="font-normal normal-case">· {groupRows.length} en esta página</span>
                  <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', collapsed && '-rotate-90')} aria-hidden="true" />
                </ListGroupHeader>
                {!collapsed && groupRows.map(renderUserRow)}
              </Fragment>
            );
          })
        )}
      </ListCard>
      {hasMore && !debouncedSearch && (
        <div className="flex justify-center">
          <Button variant="outline" className="min-h-[44px]" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Cargando…</> : 'Cargar más'}
          </Button>
        </div>
      )}

      <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} />
    </AdminPage>
  );
}

export default function GuardedAdminUsersPage() {
    return (
        <AdminAuthGuard>
            <AdminUsersPage />
        </AdminAuthGuard>
    )
}
