'use client';

// Reclamos del comprador (Fase NN) -- todo lo que el comprador ve sobre problemas y
// reembolsos de SU pedido vive acá, para no engordar más el page.tsx del detalle:
// - pedido Entregado dentro de la ventana -> botón "Tengo un problema con este pedido"
// - pedido pagado trabado (>1h sin movimiento) -> botón "¿Problemas con tu pedido?"
// - reclamo ya creado -> tarjeta con el estado (en revisión / resuelto / rechazado)
// - reembolso registrado -> tarjeta verde con monto y motivo (antes era invisible para
//   el comprador: solo se enteraba por la notificación, y si la perdía no había rastro)
// La validación real (ventana, foto, dueño, montos) es server-side en /api/claims/create.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import type { Order } from '@/lib/order-service';
import {
  CLAIM_TYPES,
  DEFAULT_CLAIM_WINDOW_HOURS,
  STUCK_CLAIM_MIN_HOURS,
  STUCK_CLAIMABLE_STATUSES,
  lastMovementMillis,
  toMillis,
  type Claim,
  type ClaimType,
} from '@/lib/claim-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ImageUpload } from '@/components/image-upload';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, MessageSquareWarning, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

export function ClaimSection({ order }: { order: Order }) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  // Ventana configurable (config/platform.claimWindowHours) -- misma lectura barata de
  // un doc que ya hacen el home y el checkout con deliveryFee.
  const [windowHours, setWindowHours] = useState<number>(DEFAULT_CLAIM_WINDOW_HOURS);
  useEffect(() => {
    if (!firestore) return;
    getDoc(doc(firestore, 'config', 'platform'))
      .then(snap => {
        const v = Number(snap.data()?.claimWindowHours);
        if (Number.isFinite(v) && v > 0) setWindowHours(v);
      })
      .catch(() => { /* default */ });
  }, [firestore]);

  // El reclamo existente (si hay): el comprador puede leer el suyo por las reglas.
  const claimRef = useMemoFirebase(
    () => (firestore && order.claimId ? doc(firestore, 'claims', order.claimId) : null),
    [firestore, order.claimId],
  );
  const { data: claim } = useDoc<Claim>(claimRef);

  // --- Elegibilidad ---
  const now = Date.now();
  const deliveredMs = toMillis(order.deliveredAt) ?? lastMovementMillis(order);
  const isDelivered = order.status === 'Entregado';
  const withinWindow = !deliveredMs || now - deliveredMs <= windowHours * 3600_000;

  const isPaid = (order as any).paymentStatus === 'paid';
  const isStuck = isPaid &&
    (STUCK_CLAIMABLE_STATUSES as readonly string[]).includes(order.status) &&
    now - lastMovementMillis(order) >= STUCK_CLAIM_MIN_HOURS * 3600_000;

  // --- Diálogo ---
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ClaimType | null>(null);
  const [description, setDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [photoPath, setPhotoPath] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const availableTypes = useMemo(() => {
    const context = isDelivered ? 'delivered' : 'stuck';
    return (Object.entries(CLAIM_TYPES) as [ClaimType, typeof CLAIM_TYPES[ClaimType]][])
      .filter(([, meta]) => meta.context === context);
  }, [isDelivered]);

  const meta = type ? CLAIM_TYPES[type] : null;
  const chosenIds = Object.keys(selectedItems).filter(id => selectedItems[id]);
  const suggested = meta?.itemBased
    ? order.items.filter(it => chosenIds.includes(String(it.id)))
        .reduce((s, it) => s + it.price * it.quantity, 0)
    : null;

  const canSubmit = !!type && description.trim().length >= 10 &&
    (!meta?.itemBased || chosenIds.length > 0) &&
    (!meta?.requiresPhoto || !!photoPath);

  const openDialog = () => {
    // Con un solo tipo posible (trabado), se preselecciona y no se muestra el selector.
    setType(isDelivered ? null : 'stuck_order');
    setDescription('');
    setSelectedItems({});
    setPhotoPath('');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!user || !type) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/claims/create', user, {
        orderId: order.id,
        type,
        description: description.trim(),
        itemIds: chosenIds,
        photoPath: photoPath || null,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el reclamo.');
      toast({ title: '📋 Reclamo enviado', description: 'Lo vamos a revisar y te avisamos qué resolvimos.' });
      setOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Reembolso registrado: visible para el comprador, no solo la notificación */}
      {order.refunded && (
        <Card className="border-success/30 bg-success/10">
          <CardContent className="p-4 flex items-start gap-3">
            <Wallet className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-success">Te devolvimos {money(order.refundAmount || 0)}</p>
              <p className="text-muted-foreground">
                {order.refundReason ? `Motivo: ${order.refundReason}. ` : ''}
                La acreditación puede tardar unos días según tu medio de pago.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado del reclamo existente */}
      {order.claimId && claim && (
        <Card className={cn('border-l-4',
          claim.resolved
            ? (claim.resolution === 'rejected' ? 'border-l-muted-foreground' : 'border-l-success')
            : 'border-l-warning')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4" /> Tu reclamo
              <Badge variant="outline" className="ml-auto text-[10px]">
                {CLAIM_TYPES[claim.type]?.label || claim.type}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {!claim.resolved && (
              <p className="text-muted-foreground flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-warning" />
                Lo estamos revisando. Te avisamos por la campanita cuando haya novedades.
              </p>
            )}
            {claim.resolved && claim.resolution === 'refunded' && (
              <p className="text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Resuelto con reembolso{order.refundAmount ? ` de ${money(order.refundAmount)}` : ''}.
              </p>
            )}
            {claim.resolved && claim.resolution === 'rejected' && (
              <div className="text-muted-foreground">
                <p>Revisamos tu reclamo y esta vez no pudimos aprobarlo.</p>
                {claim.resolutionNote && <blockquote className="border-l-2 pl-3 mt-1 italic">{claim.resolutionNote}</blockquote>}
              </div>
            )}
            {claim.resolved && claim.resolution === 'other' && (
              <div className="text-muted-foreground">
                <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Resuelto.</p>
                {claim.resolutionNote && <blockquote className="border-l-2 pl-3 mt-1 italic">{claim.resolutionNote}</blockquote>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botón de reclamo (solo si no hay uno ya) */}
      {!order.claimId && isDelivered && withinWindow && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">¿Algo salió mal con tu pedido?</p>
            <Button variant="outline" size="sm" onClick={openDialog}>
              <AlertTriangle className="mr-2 h-4 w-4" /> Reportar un problema
            </Button>
          </CardContent>
        </Card>
      )}
      {!order.claimId && isDelivered && !withinWindow && (
        <p className="text-xs text-muted-foreground text-center">
          El plazo para reclamar por este pedido venció ({windowHours}h desde la entrega).
          Si necesitás ayuda, escribinos por el chat del pedido.
        </p>
      )}
      {!order.claimId && !isDelivered && isStuck && (
        <Card className="border-warning/30 bg-warning/10">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm">Tu pedido lleva un buen rato sin avances.</p>
            <Button variant="outline" size="sm" onClick={openDialog}>
              <AlertTriangle className="mr-2 h-4 w-4" /> ¿Problemas con tu pedido?
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reportar un problema</DialogTitle>
            <DialogDescription>
              {isDelivered
                ? 'Contanos qué pasó con tu pedido. Lo revisamos y te respondemos.'
                : 'Avisamos al equipo para que revise tu pedido demorado. No se cancela nada.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isDelivered && (
              <div className="space-y-2">
                <Label>¿Qué pasó?</Label>
                <div className="grid gap-2">
                  {availableTypes.map(([key, m]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setType(key)}
                      className={cn(
                        'text-left rounded-lg border p-3 transition-colors',
                        type === key ? 'border-primary bg-primary/10' : 'hover:bg-muted/50',
                      )}
                    >
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {meta?.itemBased && (
              <div className="space-y-2">
                <Label>¿Qué productos?</Label>
                <div className="space-y-1.5 rounded-lg border p-3">
                  {order.items.map(it => (
                    <label key={it.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={!!selectedItems[String(it.id)]}
                        onCheckedChange={(c) =>
                          setSelectedItems(prev => ({ ...prev, [String(it.id)]: c === true }))}
                      />
                      <span className="flex-1">{it.name} <span className="text-muted-foreground">×{it.quantity}</span></span>
                      <span className="text-muted-foreground">{money(it.price * it.quantity)}</span>
                    </label>
                  ))}
                </div>
                {suggested !== null && suggested > 0 && (
                  <p className="text-xs text-muted-foreground">Monto reclamado: <strong>{money(suggested)}</strong></p>
                )}
              </div>
            )}

            {type && (
              <div className="space-y-2">
                <Label htmlFor="claim-desc">Contanos más</Label>
                <Textarea
                  id="claim-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Qué pasó, cómo llegó el pedido, cualquier detalle que ayude…"
                  rows={3}
                  maxLength={500}
                />
              </div>
            )}

            {meta && meta.context === 'delivered' && (
              <div className="space-y-2">
                <Label>
                  Foto del problema {meta.requiresPhoto
                    ? <span className="text-destructive">*</span>
                    : <span className="text-muted-foreground font-normal">(opcional)</span>}
                </Label>
                {user && (
                  <ImageUpload
                    ownerId={user.uid}
                    folder="claims"
                    variant="banner"
                    storeRawPath
                    onImageUploaded={setPhotoPath}
                  />
                )}
                {meta.requiresPhoto && !photoPath && (
                  <p className="text-xs text-muted-foreground">
                    Para este tipo de reclamo necesitamos una foto del producto.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar reclamo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
