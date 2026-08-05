'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useCountFromServer } from '@/lib/firebase-aggregate';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, documentId,
  doc, updateDoc, deleteDoc, setDoc, serverTimestamp, deleteField, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Search, MoreHorizontal, Shield, Trash2, Users, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import AdminAuthGuard from '../admin-auth-guard';
import { logAdminAction } from '@/lib/admin-audit';
import { UserDetailDialog } from './user-detail-dialog';

const PAGE_SIZE = 25;

function AdminUsersPage() {
  const { user: currentUser, isFullAdmin } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'buyer' | 'store' | 'delivery' | 'admin'>('all');
  const [detailUser, setDetailUser] = useState<any | null>(null);

  // Lista paginada (getDocs + cursor). No usamos useCollection porque necesitamos el snapshot
  // del último doc para startAfter, y el hook compartido lo descarta.
  const [rows, setRows] = useState<any[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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

  // Debounce del buscador.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Arma la query según el modo: búsqueda por prefijo de email, filtro por rol, o todos.
  // Ninguna combinación necesita índice compuesto: búsqueda = rango sobre un solo campo (email);
  // filtro por rol = igualdad + orderBy(documentId) (servido por el índice de un solo campo).
  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const col = collection(firestore, 'users');
    const cons: any[] = [];
    if (debouncedSearch) {
      cons.push(where('email', '>=', debouncedSearch), where('email', '<=', debouncedSearch + ''), orderBy('email'));
    } else if (roleFilter !== 'all') {
      cons.push(where('role', '==', roleFilter), orderBy(documentId()));
    } else {
      cons.push(orderBy(documentId()));
    }
    cons.push(limit(PAGE_SIZE));
    if (cursor) cons.push(startAfter(cursor));
    return query(col, ...cons);
  }, [firestore, debouncedSearch, roleFilter]);

  const resetLoad = useCallback(async () => {
    const q = buildQuery(null);
    if (!q) return;
    setIsLoading(true);
    try {
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastSnap(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error al cargar usuarios' });
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, toast]);

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
    if ((promotingToAdmin || demotingFromAdmin) && !isFullAdmin) {
        toast({ variant: 'destructive', title: 'No autorizado', description: 'Necesitás acceso completo de administrador para esto.' });
        return;
    }

    const confirmMessage = promotingToAdmin
        ? `⚠️ Le vas a dar acceso de administrador ${level === 'full' ? 'TOTAL' : 'de SOPORTE (operativo, sin plata/config/broadcast)'} a este usuario. ¿Confirmás?`
        : demotingFromAdmin
        ? '¿Confirmás quitarle el acceso de administrador a este usuario?'
        : `¿Estás seguro de cambiar el rol de este usuario a ${newRole}?`;

    if (!confirm(confirmMessage)) return;

    try {
        // role en users/{uid} es lo que decide la UI del lado del cliente,
        // pero el acceso real a datos sensibles depende de roles_admin/{uid}
        // (asi lo exige firestore.rules) — hay que mantener los dos en sync.
        await updateDoc(doc(firestore, 'users', userId), {
            role: newRole,
            ...(promotingToAdmin ? { adminLevel: level } : {}),
            ...(demotingFromAdmin ? { adminLevel: deleteField() } : {}),
        });

        if (promotingToAdmin) {
            await setDoc(doc(firestore, 'roles_admin', userId), { role: 'admin', level, createdAt: serverTimestamp() });
        } else if (demotingFromAdmin) {
            await deleteDoc(doc(firestore, 'roles_admin', userId));
        }

        toast({ title: 'Rol actualizado', description: `El usuario ahora es ${newRole}${promotingToAdmin ? ` (${level === 'full' ? 'completo' : 'soporte'})` : ''}.` });
        if (firestore && currentUser) logAdminAction(firestore, currentUser.uid, 'change_role', userId, `${oldRole} → ${newRole}${promotingToAdmin ? ` (${level})` : ''}`);
        resetLoad();
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
    if (!confirm(newLevel === 'support'
        ? '¿Bajar a este admin a nivel Soporte (sin plata/config/broadcast/borrar cuentas)?'
        : '¿Darle a este admin acceso TOTAL?')) return;

    try {
        await updateDoc(doc(firestore, 'users', userId), { adminLevel: newLevel });
        await updateDoc(doc(firestore, 'roles_admin', userId), { level: newLevel });
        toast({ title: 'Nivel actualizado', description: `Ahora es admin ${newLevel === 'full' ? 'completo' : 'de soporte'}.` });
        if (currentUser) logAdminAction(firestore, currentUser.uid, 'change_admin_level', userId, newLevel);
        resetLoad();
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
    if (!confirm("⚠️ ¿Estás seguro? Esto elimina la cuenta permanentemente (Firebase Auth + Firestore).")) return;

    try {
        const res = await authedFetch('/api/admin/delete-user', currentUser, { userId });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');
        toast({ title: 'Usuario eliminado', description: 'La cuenta fue borrada de Auth y Firestore.' });
        if (firestore && currentUser) logAdminAction(firestore, currentUser.uid, 'delete_user', userId);
        resetLoad();
        refreshCounts();
    } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    }
  };

  return (
    <div className="container mx-auto space-y-6">
      <PageHeader
        title="Gestión de Usuarios"
        description="Administra clientes, asigna roles y mantén limpia la base de datos."
      />

      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" /> Base de Usuarios ({roleCounts.all})
                    </CardTitle>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por email (prefijo)..."
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mt-3">
                {([
                    { k: 'all',      label: 'Todos' },
                    { k: 'buyer',    label: 'Clientes' },
                    { k: 'store',    label: 'Tiendas' },
                    { k: 'delivery', label: 'Repartidores' },
                    { k: 'admin',    label: 'Admins' },
                ] as const).map(({ k, label }) => (
                    <button key={k} onClick={() => setRoleFilter(k)}
                        className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                            roleFilter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        )}>
                        {label} ({roleCounts[k]})
                    </button>
                ))}
            </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead>Usuario</TableHead>
                            <TableHead>Rol Actual</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : displayed.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9 border">
                                        <AvatarImage src={user.photoURL || user.profileImageUrl} />
                                        <AvatarFallback>{user.displayName?.charAt(0) || user.name?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium text-sm">{user.displayName || user.name || 'Sin Nombre'}</div>
                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className={
                                            user.role === 'admin' ? 'border-primary/50 text-primary bg-primary/10' :
                                            user.role === 'store' ? 'border-info/50 text-info bg-info/10' :
                                            user.role === 'delivery' ? 'border-warning/50 text-warning bg-warning/10' :
                                            'bg-muted text-muted-foreground border-border'
                                        }>
                                            {user.role === 'buyer' ? 'Cliente' : user.role === 'store' ? 'Tienda' : user.role === 'delivery' ? 'Repartidor' : 'Admin'}
                                        </Badge>
                                        {user.role === 'admin' && (
                                            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                                                {user.adminLevel === 'support' ? 'Soporte' : 'Completo'}
                                            </Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {user.role === 'store' || user.role === 'delivery' ? (
                                        <Badge variant={user.isApproved ? 'default' : 'secondary'} className="text-[10px]">
                                            {user.isApproved ? 'Aprobado' : 'Pendiente'}
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalle" onClick={() => setDetailUser(user)}>
                                            <Eye className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-muted">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-52">
                                                <DropdownMenuLabel>Cambiar Rol</DropdownMenuLabel>
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
                                            <Button variant="destructive" size="icon" className="h-8 w-8 opacity-70 hover:opacity-100" onClick={() => handleDeleteUser(user.id)} title="Eliminar Usuario">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && displayed.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    {debouncedSearch
                                        ? <>No se encontraron usuarios con el email &quot;{debouncedSearch}&quot;.</>
                                        : 'No hay usuarios para mostrar.'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {hasMore && !debouncedSearch && (
                <div className="flex justify-center mt-4">
                    <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando...</> : 'Cargar más'}
                    </Button>
                </div>
            )}
        </CardContent>
      </Card>

      <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} />
    </div>
  );
}

export default function GuardedAdminUsersPage() {
    return (
        <AdminAuthGuard>
            <AdminUsersPage />
        </AdminAuthGuard>
    )
}
