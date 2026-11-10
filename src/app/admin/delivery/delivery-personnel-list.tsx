'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Eye, Car, FileText, Phone, Mail, ExternalLink, Bike, Star, AlertTriangle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { PersonnelActions } from './personnel-actions';
import { ListCard, ListRow, PersonTile, RowIconButton } from '@/components/admin/admin-list';
import { SOFT_BADGE } from '@/components/admin/status-badge';
import { EmptyState } from '@/components/admin/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Definimos la interfaz localmente para evitar problemas de importación
export interface DeliveryPersonnel {
  id: string;
  name: string;
  email: string;
  status: 'Activo' | 'Inactivo' | 'Pendiente' | 'Rechazado' | 'Suspendido';
  phoneNumber?: string;
  vehicle?: string | { type?: string; plate?: string; model?: string; color?: string };
  profileImageUrl?: string;
  licenseUrl?: string;
  licenseBackUrl?: string;
  licenseSelfieUrl?: string;
  joinedDate?: string;
  zone?: string;
  rating?: number;
  ratingCount?: number;
}

interface DeliveryPersonnelListProps {
    personnel: DeliveryPersonnel[];
    onStatusUpdate: (personnelId: string, status: 'approved' | 'rejected') => void;
    onEdit: (driver: DeliveryPersonnel) => void;
    onDelete: (driverId: string) => void;
    /** Fase YY ter: suspender (con motivo y apelación) a un repartidor YA aprobado. */
    onSuspend: (driver: DeliveryPersonnel) => void;
}

const DRIVER_STATE: Record<string, { label: string; tone: keyof typeof SOFT_BADGE }> = {
  Activo: { label: 'Activo', tone: 'success' },
  Pendiente: { label: 'Pendiente', tone: 'warning' },
  Suspendido: { label: 'Suspendido', tone: 'destructive' },
  Rechazado: { label: 'Rechazado', tone: 'neutral' },
  Inactivo: { label: 'Inactivo', tone: 'neutral' },
};

export function DeliveryPersonnelList({ personnel, onStatusUpdate, onEdit, onDelete, onSuspend }: DeliveryPersonnelListProps) {
  const { user: adminUser } = useAuth();
  const [selectedDriver, setSelectedDriver] = useState<DeliveryPersonnel | null>(null);
  // Fotos de licencia: URLs firmadas de corta duración, nunca el link permanente con token
  // viejo -- ver /api/licenses/signed-url.
  const [licenseUrls, setLicenseUrls] = useState<Record<string, string | null>>({});
  const [loadingLicenses, setLoadingLicenses] = useState(false);

  useEffect(() => {
    if (!selectedDriver || !adminUser) { setLicenseUrls({}); return; }
    let cancelled = false;
    setLoadingLicenses(true);
    adminUser.getIdToken()
      .then(token => fetch('/api/licenses/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: selectedDriver.id }),
      }))
      .then(res => res.json())
      .then(data => { if (!cancelled) setLicenseUrls(data); })
      .catch(err => console.error('Error resolviendo fotos de licencia:', err))
      .finally(() => { if (!cancelled) setLoadingLicenses(false); });
    return () => { cancelled = true; };
  }, [selectedDriver, adminUser]);

  if (!personnel) return null;

  return (
    <>
      {personnel.length === 0 ? (
        <ListCard>
          <EmptyState icon={Bike} title="No se encontró personal con ese filtro" />
        </ListCard>
      ) : (
        <ListCard testId="drivers-list">
          {personnel.map((driver, i) => {
            const st = DRIVER_STATE[driver.status] ?? { label: driver.status || '—', tone: 'neutral' as const };
            const v = driver.vehicle;
            const vehicle = typeof v === 'string' ? v : (v && typeof v === 'object') ? [v.type, v.plate].filter(Boolean).join(' · ') : '';
            const online = (driver as any).isOnline !== false;
            return (
              <ListRow
                key={driver.id}
                index={i}
                testId="driver-row"
                highlight={driver.status === 'Pendiente' ? 'warning' : undefined}
                leading={<PersonTile role="delivery" photo={driver.profileImageUrl} />}
                title={driver.name || driver.email || 'Sin nombre'}
                href={`/admin/delivery/${driver.id}`}
                subtitle={
                  <span className="block truncate">
                    <span className="capitalize">{vehicle || 'Sin vehículo cargado'}</span>
                    <span className="hidden md:inline"> · {driver.email}</span>
                  </span>
                }
                meta={
                  <>
                    <span className={cn('inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold', SOFT_BADGE[st.tone])} data-testid="driver-state">{st.label}</span>
                    {driver.status === 'Activo' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', online ? 'bg-success' : 'bg-muted-foreground/60')} aria-hidden="true" />
                        {online ? 'Disponible' : 'No disponible'}
                      </span>
                    ) : driver.rating ? (
                      <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" /><span className="font-semibold tabular-nums text-foreground">{Number(driver.rating).toFixed(1).replace('.', ',')}</span></span>
                    ) : null}
                  </>
                }
                actions={
                  <>
                    <RowIconButton label="Ver ficha técnica" onClick={() => setSelectedDriver(driver)}><Eye className="h-4 w-4" aria-hidden="true" /></RowIconButton>
                    {/* Tanda B: la lista nunca enlazaba a la ficha COMPLETA del repartidor
                        (métricas, CBU, estado de cuenta) — solo se llegaba por el ⌘K o Finanzas. */}
                    <RowIconButton label="Ficha completa (métricas, billetera, estado de cuenta)" className="hidden sm:inline-flex" href={`/admin/delivery/${driver.id}`}><ExternalLink className="h-4 w-4" aria-hidden="true" /></RowIconButton>
                    <PersonnelActions
                      driver={driver as any}
                      onStatusUpdate={onStatusUpdate}
                      onEdit={onEdit as any}
                      onDelete={onDelete}
                      onSuspend={onSuspend}
                    />
                  </>
                }
              >
                <span className={cn('mt-1 inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold min-[380px]:hidden', SOFT_BADGE[st.tone])}>{st.label}</span>
              </ListRow>
            );
          })}
        </ListCard>
      )}

      {/* Modal de detalles del conductor */}
      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <DialogContent className="max-w-md" data-surface="admin">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={selectedDriver?.profileImageUrl} />
                        <AvatarFallback>{selectedDriver?.name?.[0]}</AvatarFallback>
                    </Avatar>
                    {selectedDriver?.name}
                </DialogTitle>
                <DialogDescription>ID: {selectedDriver?.id ? `${selectedDriver.id.slice(0, 8)}…` : '—'}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" /> {selectedDriver?.email}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" /> {selectedDriver?.phoneNumber || 'Sin teléfono'}
                    </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-lg border">
                    <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <Car className="h-4 w-4 text-primary" /> Información del Vehículo
                    </h4>
                    {selectedDriver?.vehicle && typeof selectedDriver.vehicle === 'object' ? (
                        <div className="text-sm space-y-1">
                            <p><strong>Tipo:</strong> {selectedDriver.vehicle.type}</p>
                            <p><strong>Modelo:</strong> {selectedDriver.vehicle.model}</p>
                            <p><strong>Patente/Placa:</strong> <span className="font-mono bg-muted px-1 border rounded">{selectedDriver.vehicle.plate}</span></p>
                            <p><strong>Color:</strong> {selectedDriver.vehicle.color}</p>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">
                            {typeof selectedDriver?.vehicle === 'string' ? selectedDriver.vehicle : 'No ha registrado vehículo aún.'}
                        </p>
                    )}
                </div>

                <div className="bg-muted/30 p-3 rounded-lg border">
                    <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-info-ink" /> Licencia de Conducir
                    </h4>
                    {(selectedDriver?.licenseUrl || selectedDriver?.licenseBackUrl || selectedDriver?.licenseSelfieUrl) ? (
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                { label: 'Frente', has: !!selectedDriver?.licenseUrl, url: licenseUrls.licenseUrl },
                                { label: 'Dorso', has: !!selectedDriver?.licenseBackUrl, url: licenseUrls.licenseBackUrl },
                                { label: 'Selfie', has: !!selectedDriver?.licenseSelfieUrl, url: licenseUrls.licenseSelfieUrl },
                                // Cédula y seguro del vehículo (Fase PP)
                                { label: 'Cédula vehículo', has: !!(selectedDriver as any)?.vehicleDocUrl, url: (licenseUrls as any).vehicleDocUrl },
                                { label: 'Seguro vigente', has: !!(selectedDriver as any)?.vehicleInsuranceUrl, url: (licenseUrls as any).vehicleInsuranceUrl },
                            ]).map(({ label, has, url }) => (
                                <div key={label} className="space-y-1">
                                    <p className="text-xs text-muted-foreground text-center">{label}</p>
                                    {!has ? (
                                        <div className="h-24 rounded-md border border-dashed bg-muted/50 flex items-center justify-center text-xs text-destructive-ink text-center px-1">Falta</div>
                                    ) : url ? (
                                        <a href={url} target="_blank" rel="noreferrer" className="block relative h-24 rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition">
                                            <img src={url} alt={label} className="h-full w-full object-cover" />
                                        </a>
                                    ) : (
                                        <div className="h-24 rounded-md border border-dashed bg-muted/50 flex items-center justify-center text-xs text-muted-foreground text-center px-1">
                                            {loadingLicenses ? 'Cargando...' : 'Error'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-destructive-ink italic flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> No subió fotos de licencia.
                        </p>
                    )}
                </div>

                {/* Aprobar/Rechazar solo para solicitudes (Pendiente) o cuentas que nunca
                    operaron (Rechazado/Inactivo). A un repartidor ACTIVO no se lo "rechaza":
                    se lo suspende con motivo y derecho a apelar (Fase YY ter). Antes este
                    modal mostraba "Rechazar" para cualquier estado = desactivar sin motivo. */}
                {selectedDriver && selectedDriver.status === 'Activo' && (
                    <div className="flex gap-2 pt-2">
                        <Button variant="destructive" className="w-full" data-testid="modal-suspend" onClick={() => {
                            onSuspend(selectedDriver);
                            setSelectedDriver(null);
                        }}>
                            Suspender…
                        </Button>
                    </div>
                )}
                {selectedDriver && selectedDriver.status === 'Suspendido' && (
                    <p className="pt-2 text-sm text-muted-foreground">
                        Cuenta suspendida. Para levantar la suspensión o resolver su apelación, abrí la ficha completa.
                    </p>
                )}
                {selectedDriver && !['Activo', 'Suspendido'].includes(selectedDriver.status) && (
                    <div className="flex gap-2 pt-2">
                        <Button className="w-full bg-success hover:bg-success/90 text-success-foreground" onClick={() => {
                            onStatusUpdate(selectedDriver.id, 'approved');
                            setSelectedDriver(null);
                        }}>
                            Aprobar
                        </Button>
                        <Button variant="destructive" className="w-full" onClick={() => {
                            onStatusUpdate(selectedDriver.id, 'rejected');
                            setSelectedDriver(null);
                        }}>
                            Rechazar
                        </Button>
                    </div>
                )}
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}