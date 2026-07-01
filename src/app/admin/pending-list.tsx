'use client';

import { useState } from 'react';
import type { UserProfile } from '@/context/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, X, Eye, Car, FileText, Clock, MapPin } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface PendingUser extends UserProfile {
  id: string;
  isApproved?: boolean;
  photoURL?: string;
  profileImageUrl?: string;
  vehicle?: any;
  licenseUrl?: string;
  licenseBackUrl?: string;
  licenseSelfieUrl?: string;
  imageUrl?: string;
  description?: string;
  address?: string;
  schedule?: any;
}

interface PendingListProps {
  title: string;
  icon: React.ElementType;
  users: PendingUser[];
  onApprove: (userId: string, name: string) => void;
  onReject: (userId: string, name: string) => void;
  isLoading: boolean;
}

export function PendingList({ title, icon: Icon, users, onApprove, onReject, isLoading }: PendingListProps) {
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="h-fit shadow-md border-l-4 border-l-warning">
        <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/10">
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
          <div className="bg-muted p-2 rounded-full shadow-sm">
            <Icon className="h-5 w-5 text-warning" />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg bg-muted/5">
              <Check className="mx-auto h-6 w-6 mb-2 text-success/50" />
              <p>¡Todo al día! No hay solicitudes pendientes.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {users.map(user => (
                <div key={user.id} className="border p-3 rounded-lg flex items-center justify-between bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Avatar className="h-9 w-9 border">
                      <AvatarImage src={user.photoURL || user.profileImageUrl} />
                      <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="overflow-hidden">
                      <p className="font-semibold text-sm truncate max-w-[120px]">{user.displayName || user.name || 'Usuario'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex space-x-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-info hover:bg-info/10" onClick={() => setSelectedUser(user)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 text-success hover:text-success hover:bg-success/10 border-success/30" onClick={() => onApprove(user.id, user.name || 'Usuario')}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => onReject(user.id, user.name || 'Usuario')}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={selectedUser?.profileImageUrl || selectedUser?.photoURL} />
                <AvatarFallback>{selectedUser?.displayName?.[0]}</AvatarFallback>
              </Avatar>
              {selectedUser?.displayName || selectedUser?.name}
            </DialogTitle>
            <DialogDescription>
              Solicitud de: {selectedUser?.role === 'delivery' ? 'Repartidor' : 'Tienda'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedUser?.role === 'delivery' && (
              <>
                <div className="bg-muted/30 p-3 rounded-lg border">
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <Car className="h-4 w-4 text-primary" /> Vehículo
                  </h4>
                  {selectedUser.vehicle ? (
                    <div className="text-sm space-y-1">
                      <p>Tipo: {selectedUser.vehicle.type || 'N/A'}</p>
                      <p>Patente: <span className="font-mono bg-muted px-1 border rounded">{selectedUser.vehicle.plate || 'N/A'}</span></p>
                      <p>Modelo: {selectedUser.vehicle.model || 'N/A'}</p>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Sin datos de vehículo.</p>}
                </div>
                <div className="bg-muted/30 p-3 rounded-lg border">
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-info" /> Licencia de conducir
                  </h4>
                  {(selectedUser.licenseUrl || selectedUser.licenseBackUrl || selectedUser.licenseSelfieUrl) ? (
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { label: 'Frente', url: selectedUser.licenseUrl },
                        { label: 'Dorso', url: selectedUser.licenseBackUrl },
                        { label: 'Selfie', url: selectedUser.licenseSelfieUrl },
                      ]).map(({ label, url }) => (
                        <div key={label} className="space-y-1">
                          <p className="text-[10px] text-muted-foreground text-center">{label}</p>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="block relative h-20 rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition">
                              <img src={url} alt={label} className="h-full w-full object-cover" />
                            </a>
                          ) : (
                            <div className="h-20 rounded-md border border-dashed bg-muted/50 flex items-center justify-center text-[10px] text-destructive text-center px-1">Falta</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-destructive">⚠️ No subió fotos de licencia.</p>}
                </div>
              </>
            )}

            {selectedUser?.role === 'store' && (
              <>
                <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted">
                  {selectedUser.imageUrl ? (
                    <img src={selectedUser.imageUrl} alt="Portada" className="w-full h-full object-cover" />
                  ) : <div className="flex items-center justify-center h-full text-muted-foreground">Sin Portada</div>}
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {selectedUser.address || 'Sin dirección'}</div>
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-success" />
                    {selectedUser.schedule ? `${selectedUser.schedule.open} - ${selectedUser.schedule.close}` : 'Horario no definido'}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="w-full bg-success hover:bg-success/90 text-success-foreground" onClick={() => {
                if (selectedUser) onApprove(selectedUser.id, selectedUser.name || 'Usuario');
                setSelectedUser(null);
              }}>
                Aprobar
              </Button>
              <Button variant="destructive" className="w-full" onClick={() => {
                if (selectedUser) onReject(selectedUser.id, selectedUser.name || 'Usuario');
                setSelectedUser(null);
              }}>
                Rechazar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
