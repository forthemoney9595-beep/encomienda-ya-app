'use client';

import { useState, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
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

type DriverFilter = 'all' | 'pending' | 'active' | 'rejected';

function AdminDeliveryPage() {
  const { user, isFullAdmin, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryPersonnel | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DriverFilter>('all');

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
      if (statusFilter === 'rejected' && !['Rechazado', 'Inactivo'].includes(p.status)) return false;
      if (!t) return true;
      const plate = typeof p.vehicle === 'object' && p.vehicle ? p.vehicle.plate || '' : '';
      return `${p.name || ''} ${p.email || ''} ${plate}`.toLowerCase().includes(t);
    });
  }, [personnel, search, statusFilter]);

  const counts = useMemo(() => ({
    all: personnel?.length || 0,
    pending: (personnel || []).filter(p => p.status === 'Pendiente').length,
    active: (personnel || []).filter(p => p.status === 'Activo').length,
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
        if (!confirm(`${data.error}

¿Borrar igual? La deuda se pierde y queda registrada en el log.`)) return;
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

  return (
    <div className="container mx-auto space-y-6">
      <ManageDriverDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveDriver}
        driver={editingDriver}
      />
      
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas y aprobaciones de tu flota." />

      {/* Búsqueda + filtro por estado: antes esta página no tenía NINGUNO de los dos, había
          que revisar la lista completa a ojo para encontrar un repartidor o ver quién estaba
          pendiente de aprobación. Filtrado en memoria: `users where role==delivery` es un
          subconjunto acotado (la flota de un pueblo), no una colección sin techo. */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, email o patente..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { k: 'all', label: 'Todos' },
            { k: 'pending', label: 'Pendientes' },
            { k: 'active', label: 'Activos' },
            { k: 'rejected', label: 'Rechazados' },
          ] as { k: DriverFilter; label: string }[]).map(({ k, label }) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                statusFilter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
              {label} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      {authLoading || personnelLoading ? (
         <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-8 w-24" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      ) : (
        <DeliveryPersonnelList
          personnel={filteredPersonnel}
          onStatusUpdate={handleStatusUpdate}
          onEdit={openDialogForEdit}
          onDelete={handleDeleteDriver}
        />
      )}
    </div>
  );
}

export default function GuardedAdminDeliveryPage() {
    return (
        <AdminAuthGuard>
            <AdminDeliveryPage />
        </AdminAuthGuard>
    )
}