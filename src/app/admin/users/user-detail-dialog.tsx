'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { getOrderStatusKind, orderStatusBadgeClass } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Mail, Phone, ShoppingBag, DollarSign, XCircle, ExternalLink, MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import type { Order } from '@/lib/order-service';
import { CLAIM_TYPES, type Claim, type ClaimType } from '@/lib/claim-types';

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), 'd MMM HH:mm', { locale: es }); } catch { return '—'; }
};

export function UserDetailDialog({ user, onClose }: { user: any | null; onClose: () => void }) {
  const firestore = useFirestore();

  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.id) return null;
    return query(collection(firestore, 'orders'), where('userId', '==', user.id), orderBy('createdAt', 'desc'), limit(30));
  }, [firestore, user?.id]);
  const { data: orders, isLoading } = useCollection<Order>(ordersQuery);

  // Reclamos del usuario (Fase OO): antes estaban solo en /admin/claims, sin forma de
  // verlos desde la ficha — y el patrón de reclamos de una persona es justo lo que un
  // admin necesita tener a la vista al evaluar un caso nuevo.
  const claimsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.id) return null;
    return query(collection(firestore, 'claims'), where('userId', '==', user.id), orderBy('createdAt', 'desc'), limit(20));
  }, [firestore, user?.id]);
  const { data: claims } = useCollection<Claim>(claimsQuery);

  const stats = useMemo(() => {
    const delivered = (orders || []).filter(o => o.status === 'Entregado');
    const cancelled = (orders || []).filter(o => o.status === 'Cancelado' || o.status === 'Rechazado');
    const spent = delivered.reduce((s, o) => s + (o.total || 0), 0);
    return { total: orders?.length ?? 0, delivered: delivered.length, cancelled: cancelled.length, spent };
  }, [orders]);

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border">
              <AvatarImage src={user?.photoURL || user?.profileImageUrl} />
              <AvatarFallback>{user?.displayName?.charAt(0) || user?.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <div>{user?.displayName || user?.name || 'Sin nombre'}</div>
              <div className="text-xs font-normal text-muted-foreground flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user?.email}</span>
                {user?.phoneNumber && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {user.phoneNumber}</span>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Métricas del usuario como comprador */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
          {[
            { label: 'Pedidos', value: stats.total, icon: ShoppingBag, color: 'text-info' },
            { label: 'Entregados', value: stats.delivered, icon: ShoppingBag, color: 'text-success' },
            { label: 'Cancelados', value: stats.cancelled, icon: XCircle, color: 'text-destructive' },
            { label: 'Gastado', value: `$${stats.spent.toLocaleString()}`, icon: DollarSign, color: 'text-primary' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border bg-muted/30 p-2.5">
              <Icon className={cn('h-3.5 w-3.5 mb-1', color)} />
              <div className={cn('text-lg font-bold', color)}>{value}</div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {/* Reclamos del usuario (Fase OO) — con el patrón a la vista: cuántos y cómo
            terminaron. Solo se muestra si tiene alguno. */}
        {claims && claims.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <MessageSquareWarning className="h-3.5 w-3.5 text-warning" />
              Reclamos ({claims.length}
              {claims.filter(c => c.resolution === 'refunded').length > 0 &&
                `, ${claims.filter(c => c.resolution === 'refunded').length} con reembolso`})
            </h4>
            <div className="space-y-1.5">
              {claims.map(c => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Badge variant="outline" className={cn('text-[10px] shrink-0',
                    c.resolved
                      ? (c.resolution === 'rejected' ? 'text-muted-foreground' : 'border-success/40 text-success')
                      : 'border-warning/40 text-warning')}>
                    {c.resolved ? (c.resolution === 'rejected' ? 'Rechazado' : c.resolution === 'refunded' ? 'Reembolsado' : 'Resuelto') : 'Pendiente'}
                  </Badge>
                  <span className="truncate">{CLAIM_TYPES[c.type as ClaimType]?.label || c.type}</span>
                  <span className="text-xs text-muted-foreground truncate">· {c.storeName}</span>
                  <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">{formatDate(c.createdAt)}</span>
                  <Link href={`/orders/${c.orderId}`} target="_blank" className="shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3" /></Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historial de pedidos del usuario */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Historial de pedidos</h4>
          {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Cargando...</p>}
          {!isLoading && (!orders || orders.length === 0) && (
            <p className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">Este usuario no tiene pedidos.</p>
          )}
          <div className="space-y-1.5">
            {orders?.map(o => {
              const kind = getOrderStatusKind(o.status);
              return (
                <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(o.createdAt)}</span>
                    <span className="text-muted-foreground truncate">{(o as any).storeName || ''}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold">${(o.total || 0).toLocaleString()}</span>
                    {o.refunded && (
                      <Badge variant="outline" className="text-[10px] border-info/40 text-info">
                        Reemb. ${Math.round(o.refundAmount || 0).toLocaleString()}
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn('text-[10px] uppercase', orderStatusBadgeClass[kind])}>{o.status}</Badge>
                    <Link href={`/orders/${o.id}`} target="_blank">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3" /></Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
