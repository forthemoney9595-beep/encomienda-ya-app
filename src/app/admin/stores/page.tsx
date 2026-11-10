'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Store, Plus, Trash2, Edit, Eye, Star, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { logAdminAction } from '@/lib/admin-audit';
import { setAccountApproval } from '@/lib/approval-service';
import { downloadCsv } from '@/lib/csv-export';
import { getStoreOpenStatus, isStorePaused, normalizeSchedule } from '@/lib/store-hours';
import { formatCategoryLabel } from '@/lib/category-style';
import { PLATFORM_DEFAULTS } from '@/lib/money';
import { money } from '@/lib/format-money';
import { CategoryTile } from '@/components/category-tile';
import { ManageStoreDialog } from './manage-store-dialog';
import AdminAuthGuard from '../admin-auth-guard';
import { SuspendAccountDialog, type SuspendTarget } from '@/components/admin/suspend-account-dialog';
import { AdminPage } from '@/components/admin/admin-page';
import { GlassSearch, ListCard, ListRow, RowIconButton, SlidingChips } from '@/components/admin/admin-list';
import { SOFT_BADGE } from '@/components/admin/status-badge';
import { EmptyState } from '@/components/admin/empty-state';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type StoreFilter = 'all' | 'open' | 'paused' | 'pending' | 'suspended' | 'rejected';
type StoreState = 'open' | 'closed' | 'paused' | 'pending' | 'suspended' | 'rejected';

/** Estado único de la fila (orden de prioridad: suspendida > pendiente/rechazada > pausada > horario). */
function storeState(s: any): StoreState {
  if (s.status === 'Suspendida' || s.suspension?.active === true) return 'suspended';
  if (!s.isApproved) return s.status === 'Rechazada' ? 'rejected' : 'pending';
  if (isStorePaused(s)) return 'paused';
  return getStoreOpenStatus(normalizeSchedule(s)).isOpen ? 'open' : 'closed';
}
const STATE_LABEL: Record<StoreState, { label: string; tone: keyof typeof SOFT_BADGE }> = {
  open: { label: 'Abierta', tone: 'success' },
  closed: { label: 'Cerrada', tone: 'neutral' },
  paused: { label: 'Pausada', tone: 'warning' },
  pending: { label: 'Pendiente', tone: 'warning' },
  suspended: { label: 'Suspendida', tone: 'destructive' },
  rejected: { label: 'Rechazada', tone: 'neutral' },
};

function AdminStoresPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const { user: adminUser, userProfile: adminProfile } = useAuth();
  // Borrar tienda y editar comisión son plata: solo admin 'full' (Fase PP-P1).
  const isSupport = (adminProfile as any)?.adminLevel === 'support';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StoreFilter>('all');

  // Estados para el Modal
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  // Fase YY ter: revocar una tienda aprobada = suspenderla con debido proceso.
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);

  // 1. Cargar Tiendas.
  // OJO escala: a diferencia de `orders`/`users`/`withdrawals`, `stores` es una colección
  // ACOTADA por diseño (marketplace de pueblo) y ya se baja entera en el home del
  // comprador -- por eso acá no se pagina, es el mismo criterio documentado en la Fase Y.
  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') : null, [firestore]);
  const { data: stores, isLoading } = useCollection<any>(storesQuery);

  // Comisión por defecto de la plataforma (las tiendas sin tarifa propia pagan esta).
  const cfgRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
  const { data: cfg } = useDoc<{ defaultCommissionRate?: number }>(cfgRef);
  const defaultRate = Number(cfg?.defaultCommissionRate) > 0 ? Number(cfg?.defaultCommissionRate) : PLATFORM_DEFAULTS.commissionRate;

  // 2. Filtrar (búsqueda + estado). Set chico, filtrado en memoria sin problema.
  // El estado se calcula una vez por tienda (horario + pausa), no dentro de cada filtro.
  const withState = useMemo(() => (stores || []).map(s => ({ s, state: storeState(s) })), [stores]);
  const filteredStores = useMemo(() => {
    const term = search.trim().toLowerCase();
    return withState.filter(({ s, state }) => {
      if (term && !(`${s.name || ''} ${s.category || ''} ${formatCategoryLabel(s.category || '')}`).toLowerCase().includes(term)) return false;
      if (statusFilter === 'all') return true;
      return state === statusFilter;
    }).map(x => x.s);
  }, [withState, search, statusFilter]);
  const stateOf = useMemo(() => new Map(withState.map(x => [x.s.id, x.state])), [withState]);

  const counts = useMemo(() => {
    const c = { all: withState.length, open: 0, closed: 0, paused: 0, pending: 0, suspended: 0, rejected: 0 };
    withState.forEach(x => { c[x.state]++; });
    return c;
  }, [withState]);

  const handleExportCsv = () => {
    downloadCsv(filteredStores.map((s: any) => ({
      'Tienda': s.name || '',
      'Rubro': s.category || '',
      'Dirección': s.address || '',
      // Fase PP (N12): "0" mentía — las tiendas sin tarifa propia pagan el default global.
      'Comisión (%)': (typeof s.commissionRate === 'number' && s.commissionRate > 0)
        ? s.commissionRate
        : 'default',
      'Rating': s.rating ?? '',
      'Reseñas': s.ratingCount ?? 0,
      'Estado': s.isApproved ? 'Aprobada' : s.status === 'Suspendida' ? 'Suspendida' : 'Pendiente/Rechazada',
      'Pausada': isStorePaused(s) ? 'Sí' : 'No',
      // El CBU ya no está en el doc público de la tienda (seguridad, ago 2026): vive en
      // el user doc del dueño y se ve en la ficha individual de cada tienda.
    })), `tiendas_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // 3. Manejar Guardado (AQUÍ ESTABA EL ERROR)
  const handleSaveStore = async (storeData: any) => {
      if (!firestore) return;

      try {
          if (selectedStore) {
              // --- MODO EDICIÓN ---
              const storeRef = doc(firestore, 'stores', selectedStore.id);

              await updateDoc(storeRef, {
                  name: storeData.name,
                  address: storeData.address,
                  // La comisión es plata: un admin 'support' no puede tocarla (la regla lo
                  // rechazaría de todos modos; excluirla evita que TODO el guardado falle).
                  ...(isSupport ? {} : { commissionRate: Number(storeData.commissionRate) }),
                  updatedAt: serverTimestamp()
              });

              // Aprobación SIEMPRE por el servicio único (Fase PP): antes este diálogo
              // escribía stores.isApproved/status sin tocar users.isApproved — la tienda
              // salía publicada pero el dueño quedaba para siempre en la cola de
              // solicitudes del dashboard.
              // Fase YY ter: solo se APRUEBA o RECHAZA una solicitud que nunca se aprobó. Una
              // tienda aprobada se suspende (SuspendAccountDialog) y una suspendida se levanta
              // desde su ficha — el diálogo ya bloquea el selector, esto es la red de seguridad.
              const lockedStatus = selectedStore.isApproved || selectedStore.status === 'Suspendida' || selectedStore.suspension?.active === true;
              if (!lockedStatus && storeData.isApproved !== selectedStore.isApproved) {
                  if ((selectedStore as any).ownerId) {
                      await setAccountApproval(firestore, {
                          userId: (selectedStore as any).ownerId,
                          approved: !!storeData.isApproved,
                          role: 'store',
                          storeId: selectedStore.id,
                          adminUser,
                          label: `tienda: ${storeData.name}`,
                      });
                  } else {
                      // Tienda sin dueño (caso anómalo): al menos publicar/despublicar.
                      await updateDoc(storeRef, { isApproved: !!storeData.isApproved, status: storeData.status });
                  }
              }

              // Cambiar la comisión define cuánto se queda la plataforma de cada venta --
              // se audita igual que el resto de las acciones que tocan plata.
              if (adminUser) logAdminAction(firestore, adminUser.uid, 'edit_store', selectedStore.id, `${storeData.name} — comisión ${storeData.commissionRate}% · ${storeData.status}`);
              toast({ title: "Tienda actualizada", description: "Los cambios se han guardado." });
          } else {
              // --- MODO CREACIÓN --- (Opcional, si creas tiendas manuales)
              await addDoc(collection(firestore, 'stores'), {
                  ...storeData,
                  commissionRate: Number(storeData.commissionRate),
                  createdAt: serverTimestamp()
              });
              toast({ title: "Tienda creada" });
          }
          setIsDialogOpen(false);
          setSelectedStore(null);
      } catch (error) {
          console.error(error);
          toast({ variant: "destructive", title: "Error al guardar" });
      }
  };

  // 4. Manejar Borrado.
  // OJO: esto borra SOLO el documento de la tienda -- sus productos (subcolecciones
  // items/products) y sus pedidos históricos quedan en la base. Por eso el mensaje avisa
  // que conviene rechazar/pausar en vez de borrar salvo que sea un alta errónea.
  const handleDelete = async (id: string, name?: string, ownerId?: string) => {
      if (!firestore) return;

      // 🚨 Borrar la tienda hace desaparecer su saldo: computeStoreBalance() arranca del doc
      // de la tienda (ownerId + comisión), así que sin él la plata que se le debe deja de
      // ser calculable y la tienda desaparece del pasivo. Si tiene un retiro pendiente, se
      // frena directamente: eso es una solicitud de pago viva.
      if (ownerId) {
          try {
              const pend = await getDocs(query(
                  collection(firestore, 'withdrawals'),
                  where('userId', '==', ownerId),
                  where('userRole', '==', 'store'),
                  where('status', '==', 'pending'),
              ));
              if (!pend.empty) {
                  const total = pend.docs.reduce((s, d) => s + (Number(d.data().amount) || 0), 0);
                  toast({
                      variant: 'destructive',
                      title: 'Tiene un pago pendiente',
                      description: `${name || 'Esta tienda'} pidió ${money(total)} y todavía no se le pagó. Resolvé el retiro en Finanzas antes de borrarla.`,
                  });
                  return;
              }
          } catch { /* si la consulta falla, seguimos con la confirmación normal */ }
      }

      const { ok } = await confirmDialog({
        title: `¿Eliminar "${name || 'esta tienda'}"?`,
        description: 'Se borra el registro de la tienda, pero sus pedidos históricos quedan en la base. IMPORTANTE: si le quedaba saldo sin retirar, deja de ser calculable. Si solo querés que deje de operar, mejor pausala o suspendela.',
        tone: 'destructive',
        confirmLabel: 'Eliminar tienda',
      });
      if (!ok) return;
      try {
          await deleteDoc(doc(firestore, 'stores', id));
          if (adminUser) logAdminAction(firestore, adminUser.uid, 'delete_store', id, name || '');
          toast({ title: "Tienda eliminada" });
      } catch (error) {
          toast({ variant: "destructive", title: "Error al eliminar" });
      }
  };

  const chips = [
    { value: 'all' as const, label: 'Todas', count: isLoading ? null : counts.all },
    { value: 'open' as const, label: 'Abiertas', count: isLoading ? null : counts.open },
    { value: 'paused' as const, label: 'Pausadas', count: isLoading ? null : counts.paused },
    { value: 'pending' as const, label: 'Pendientes', count: isLoading ? null : counts.pending },
    // Solo si hay: no ensucian la fila de chips cuando no aplican.
    ...(counts.suspended > 0 || statusFilter === 'suspended' ? [{ value: 'suspended' as const, label: 'Suspendidas', count: counts.suspended }] : []),
    ...(counts.rejected > 0 || statusFilter === 'rejected' ? [{ value: 'rejected' as const, label: 'Rechazadas', count: counts.rejected }] : []),
  ];

  return (
    <AdminPage
      title="Tiendas"
      subtitle={isLoading ? 'Cargando…' : (
        <span data-testid="stores-kline">
          <b className="tabular-nums text-foreground">{counts.all}</b> tiendas · <b className="tabular-nums text-foreground">{counts.open}</b> abiertas ahora · <b className="tabular-nums text-foreground">{counts.paused}</b> pausadas
          {counts.pending > 0 && <> · <b className="tabular-nums text-warning-ink">{counts.pending}</b> esperando aprobación</>}
        </span>
      )}
      actions={
        <>
          <Button variant="outline" className="min-h-[44px]" onClick={handleExportCsv} disabled={filteredStores.length === 0}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> CSV
          </Button>
          <Button className="min-h-[44px]" onClick={() => { setSelectedStore(null); setIsDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nueva tienda
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <GlassSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre o rubro"
          label="Buscar tiendas"
          testId="stores-search"
          hint="Busca entre todas las tiendas de la plataforma (nombre o rubro)."
        />
        <SlidingChips chips={chips} value={statusFilter} onChange={setStatusFilter} label="Filtrar tiendas por estado" testId="stores-chips" />
      </div>

      {isLoading ? (
        <ListCard>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-3">
              <Skeleton className="h-9 w-9 rounded-[0.75rem]" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
            </div>
          ))}
        </ListCard>
      ) : filteredStores.length === 0 ? (
        <ListCard>
          <EmptyState icon={Store} title="Ninguna tienda coincide con ese filtro" description={search ? `No hay tiendas para «${search.trim()}».` : undefined} />
        </ListCard>
      ) : (
        <ListCard testId="stores-list">
          {filteredStores.map((store, i) => {
            const state = stateOf.get(store.id) ?? 'pending';
            const st = STATE_LABEL[state];
            const ownRate = typeof store.commissionRate === 'number' && store.commissionRate > 0;
            return (
              <ListRow
                key={store.id}
                index={i}
                testId="store-row"
                highlight={state === 'pending' ? 'warning' : undefined}
                leading={<CategoryTile category={store.category} size="sm" />}
                title={store.name || 'Sin nombre'}
                href={`/admin/stores/${store.id}`}
                subtitle={
                  <span className="block sm:truncate">
                    {store.category ? formatCategoryLabel(store.category) : 'Sin rubro'}
                    {' · comisión '}
                    <span className="tabular-nums">{ownRate ? `${store.commissionRate} %` : `${defaultRate} % (default)`}</span>
                  </span>
                }
                meta={
                  <>
                    <span className={cn('inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold', SOFT_BADGE[st.tone])} data-testid="store-state">{st.label}</span>
                    {store.rating ? (
                      <span className="inline-flex items-center gap-1" aria-label={`Calificación ${Number(store.rating).toFixed(1)} de 5, ${store.ratingCount || 0} reseñas`}>
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" />
                        <span className="font-semibold tabular-nums text-foreground">{Number(store.rating).toFixed(1).replace('.', ',')}</span>
                        <span className="tabular-nums">({store.ratingCount || 0})</span>
                      </span>
                    ) : <span aria-label="Sin calificaciones">—</span>}
                  </>
                }
                actions={
                  <>
                    <RowIconButton label="Ver detalle" className="hidden sm:inline-flex" href={`/admin/stores/${store.id}`}><Eye className="h-4 w-4" aria-hidden="true" /></RowIconButton>
                    <RowIconButton label="Editar" onClick={() => { setSelectedStore(store); setIsDialogOpen(true); }}><Edit className="h-4 w-4" aria-hidden="true" /></RowIconButton>
                    {!isSupport && (
                      <RowIconButton label="Eliminar" tone="destructive" onClick={() => handleDelete(store.id, store.name, store.ownerId)}><Trash2 className="h-4 w-4" aria-hidden="true" /></RowIconButton>
                    )}
                  </>
                }
              >
                {/* En celular angosto la columna de estado se esconde: el estado va debajo. */}
                <span className={cn('mt-1 inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold min-[380px]:hidden', SOFT_BADGE[st.tone])}>{st.label}</span>
              </ListRow>
            );
          })}
        </ListCard>
      )}

      {/* MODAL DE EDICIÓN */}
      <ManageStoreDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        store={selectedStore}
        onSave={handleSaveStore}
        onSuspend={selectedStore?.ownerId ? () => {
          setSuspendTarget({ uid: selectedStore.ownerId, role: 'store', name: selectedStore.name || 'la tienda', storeId: selectedStore.id });
          setIsDialogOpen(false);
        } : undefined}
      />
      <SuspendAccountDialog
        open={!!suspendTarget}
        onOpenChange={(o) => { if (!o) setSuspendTarget(null); }}
        target={suspendTarget}
      />
    </AdminPage>
  );
}

export default function AdminStoresPageGuarded() {
  return <AdminAuthGuard><AdminStoresPage /></AdminAuthGuard>;
}