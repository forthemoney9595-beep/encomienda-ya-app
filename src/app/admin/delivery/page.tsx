'use client';

import { useState, useMemo } from 'react';
// ✅ Importamos la interfaz desde el archivo vecino que acabamos de arreglar
import { DeliveryPersonnelList, type DeliveryPersonnel } from './delivery-personnel-list';
// ✅ Import correcto del contexto de Auth
import { useAuth } from '@/context/auth-context'; 
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ManageDriverDialog } from './manage-driver-dialog';
import AdminAuthGuard from '../admin-auth-guard';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { logAdminAction } from '@/lib/admin-audit';
import { setAccountApproval } from '@/lib/approval-service';
import { authedFetch } from '@/lib/authed-fetch';
import { SuspendAccountDialog, type SuspendTarget } from '@/components/admin/suspend-account-dialog';
import { AdminPage } from '@/components/admin/admin-page';
import { GlassSearch, ListCard, SlidingChips } from '@/components/admin/admin-list';
import { useConfirm } from '@/components/admin/confirm-dialog';

type DriverFilter = 'all' | 'pending' | 'active' | 'suspended' | 'rejected';

function AdminDeliveryPage() {
  const { user, isFullAdmin, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirmDialog = useConfirm();

  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryPersonnel | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DriverFilter>('all');
  // Fase YY ter: desactivar a un repartidor aprobado = suspender con debido proceso.
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);

  // Consulta de Repartidores
  const personnelQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', '==', 'delivery'));
  }, [firestore]);

  const { data: personnel, isLoading: personnelLoading } = useCollection<DeliveryPersonnel>(personnelQuery);

  const filteredPersonnel = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (personnel || []).filter(p => {
      if (statusFilter === 'pending' && p.status !== 'Pendiente') return false;
      if (statusFilter === 'active' && p.status !== 'Activo') return false;
      if (statusFilter === 'suspended' && p.status !== 'Suspendido') return false;
      if (statusFilter === 'rejected' && !['Rechazado', 'Inactivo'].includes(p.status)) return false;
      if (!t) return true;
      const plate = typeof p.vehicle === 'object' && p.vehicle ? p.vehicle.plate || '' : '';
      if (`${p.name || ''} ${p.email || ''} ${plate}`.toLowerCase().includes(t)) return true;
      // También por dígitos de teléfono/DNI/CUIL (18/8) — mismo criterio que Gestión de
      // Usuarios; mínimo 3 dígitos para no matchear todo.
      const digits = t.replace(/\D+/g, '');
      if (digits.length >= 3) {
        const nums = `${p.phoneNumber || ''} ${(p as any).dni || ''} ${(p as any).cuil || ''}`.replace(/\D+/g, ' ');
        if (nums.includes(digits)) return true;
      }
      return false;
    });
  }, [personnel, search, statusFilter]);

  const counts = useMemo(() => ({
    all: personnel?.length || 0,
    pending: (personnel || []).filter(p => p.status === 'Pendiente').length,
    active: (personnel || []).filter(p => p.status === 'Activo').length,
    suspended: (personnel || []).filter(p => p.status === 'Suspendido').length,
    rejected: (personnel || []).filter(p => ['Rechazado', 'Inactivo'].includes(p.status)).length,
  }), [personnel]);

  // Aprobar / Rechazar — vía el servicio único (Fase PP): isApproved + status juntos,
  // auditado, y el repartidor SE ENTERA (antes la aprobación era silenciosa).
  const handleStatusUpdate = async (personnelId: string, status: 'approved' | 'rejected') => {
    if (!firestore) return;

    try {
        await setAccountApproval(firestore, {
            userId: personnelId,
            approved: status === 'approved',
            role: 'delivery',
            adminUser: user,
            label: 'repartidor',
        });

        toast({
            title: 'Estado Actualizado',
            description: status === 'approved'
              ? 'El repartidor fue aprobado y notificado.'
              : 'La solicitud fue rechazada y el repartidor notificado.',
            className: status === 'approved' ? "bg-success/10 text-foreground" : "bg-destructive/10 text-foreground"
        });

    } catch (error) {
       console.error(error);
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo actualizar el estado.',
        });
    }
  };

  // Editar (Desde el Modal de Gestión) — la creación manual de repartidores se
  // sacó porque solo creaba un perfil en Firestore sin cuenta real de Firebase Auth
  // (el repartidor nunca podría loguearse). El alta real es por autorregistro en
  // /signup/delivery; este panel solo aprueba/edita cuentas que ya existen.
  const handleSaveDriver = async (driverData: DeliveryPersonnel) => {
    if(!firestore || !editingDriver) return;

    try {
      const userRef = doc(firestore, 'users', driverData.id);
      // Update EXPLÍCITO (punto 2 de la prueba): solo los campos que el editor unificado
      // toca de verdad — nombre, teléfono y vehículo. Ya NO se escribe `email` (vive en
      // Auth, editarlo desincronizaba) ni `status`/`isApproved` (se cambian por
      // Aprobar/Rechazar vía approval-service, para no reintroducir la desincronización R1).
      await updateDoc(userRef, {
          name: driverData.name,
          phoneNumber: driverData.phoneNumber || '',
          vehicle: driverData.vehicle,
          updatedAt: serverTimestamp(),
      });

      if (user) logAdminAction(firestore, user.uid, 'edit_driver', driverData.id, `datos actualizados`);

      toast({
        title: 'Repartidor Actualizado',
        description: `Los datos de ${driverData.name} han sido guardados.`,
      });

    } catch(error) {
       console.error(error);
       toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo guardar el repartidor.',
        });
    } finally {
       setManageDialogOpen(false);
    }
  };

  // La confirmación ya la pide el AlertDialog en personnel-actions.tsx — acá no hace
  // falta otro confirm(). Antes esto SIEMPRE fallaba con un toast ("no habilitada
  // todavía") porque borrar solo el doc de Firestore dejaba viva la cuenta de Auth; ahora
  // va por /api/admin/delete-user (Admin SDK), que borra Auth + Firestore, igual que el
  // botón equivalente de /admin/users.
  const handleDeleteDriver = async (driverId: string) => {
    if (!user) return;
    if (!isFullAdmin) {
      toast({ variant: 'destructive', title: 'No autorizado', description: 'Necesitás acceso completo de administrador para eliminar cuentas.' });
      return;
    }
    try {
      let res = await authedFetch('/api/admin/delete-user', user, { userId: driverId });
      let data = await res.json();
      // 409 = tiene plata sin cobrar. Borrarlo haría desaparecer una deuda real, asi que la
      // API lo frena y hay que confirmarlo a mano.
      if (res.status === 409 && data.needsForce) {
        const { ok } = await confirmDialog({
          title: '¿Borrar igual?',
          description: `${data.error} La deuda se pierde y queda registrada en el log.`,
          tone: 'destructive',
          confirmLabel: 'Borrar igual',
        });
        if (!ok) return;
        res = await authedFetch('/api/admin/delete-user', user, { userId: driverId, force: true });
        data = await res.json();
      }
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      // La auditoria la escribe la propia API (admin-audit-server).
      toast({ title: 'Repartidor eliminado', description: 'La cuenta fue borrada de Auth y Firestore.' });
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    }
  };

  const openDialogForEdit = (driver: DeliveryPersonnel) => {
    setEditingDriver(driver);
    setManageDialogOpen(true);
  };

  const loadingAll = authLoading || personnelLoading;
  return (
    <AdminPage
      title="Repartidores"
      subtitle={loadingAll ? 'Cargando…' : (
        <span data-testid="drivers-kline">
          <b className="tabular-nums text-foreground">{counts.all}</b> en la flota · <b className="tabular-nums text-foreground">{counts.active}</b> activos
          {counts.pending > 0 && <> · <b className="tabular-nums text-warning-ink">{counts.pending}</b> esperando aprobación</>}
        </span>
      )}
    >
      <ManageDriverDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveDriver}
        driver={editingDriver}
      />

      {/* Búsqueda + filtro por estado. Filtrado en memoria: `users where role==delivery` es un
          subconjunto acotado (la flota de un pueblo), no una colección sin techo. */}
      <div className="space-y-3">
        <GlassSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, email, patente, teléfono o DNI"
          label="Buscar repartidores"
          testId="drivers-search"
          hint="Busca en toda la flota (teléfono, DNI o CUIL: desde 3 dígitos)."
        />
        <SlidingChips
          chips={([
            { value: 'all', label: 'Todos' },
            { value: 'active', label: 'Activos' },
            { value: 'pending', label: 'Pendientes' },
            { value: 'suspended', label: 'Suspendidos' },
            { value: 'rejected', label: 'Rechazados' },
          ] as { value: DriverFilter; label: string }[]).map(c => ({ ...c, count: loadingAll ? null : counts[c.value] }))}
          value={statusFilter}
          onChange={setStatusFilter}
          label="Filtrar repartidores por estado"
          testId="drivers-chips"
        />
      </div>

      {loadingAll ? (
        <ListCard>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-3">
              <Skeleton className="h-9 w-9 rounded-[0.75rem]" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
            </div>
          ))}
        </ListCard>
      ) : (
        <DeliveryPersonnelList
          personnel={filteredPersonnel}
          onStatusUpdate={handleStatusUpdate}
          onEdit={openDialogForEdit}
          onDelete={handleDeleteDriver}
          onSuspend={(d) => setSuspendTarget({ uid: d.id, role: 'delivery', name: d.name || d.email || 'repartidor' })}
        />
      )}

      <SuspendAccountDialog
        open={!!suspendTarget}
        onOpenChange={(o) => { if (!o) setSuspendTarget(null); }}
        target={suspendTarget}
      />
    </AdminPage>
  );
}

export default function GuardedAdminDeliveryPage() {
    return (
        <AdminAuthGuard>
            <AdminDeliveryPage />
        </AdminAuthGuard>
    )
}