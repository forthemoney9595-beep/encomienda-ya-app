'use client';

import { useState } from 'react';
import { average, collection, count, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { CheckCircle2, Clock, Inbox, Percent, TimerOff, XCircle } from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useAggregate, useCountFromServer } from '@/lib/firebase-aggregate';
import { acceptanceRate, fmtConfirmSeconds } from '@/lib/store-compliance';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Cumplimiento del comercio, últimos 30 días (Fase YY, punto 4). Lo ven el dueño
// (`/my-store`) y el admin (`/admin/stores/[storeId]`) con la MISMA fuente: aggregations
// server-side sobre `orders` (storeId + storeDecision + createdAt). Nunca baja el historial.
// Sin penalizaciones automáticas — se mide y se muestra.
//
// Índices (firestore.indexes.json): (storeId, createdAt DESC) ya existía para "recibidos";
// (storeId, storeDecision, createdAt DESC) para rechazados / no confirmados; y
// (storeId, storeDecision, createdAt ASC, confirmSeconds ASC) para count + average de los
// confirmados en una sola aggregation (una aggregation con rango + campo agregado exige un
// índice que cubra filtro, rango y campo — trampa de la Fase HH).

const DAYS = 30;

export function StoreComplianceCard({ storeId, enabled = true, variant }: { storeId: string | undefined; enabled?: boolean; variant: 'owner' | 'admin' }) {
  const firestore = useFirestore();
  const [from] = useState(() => Timestamp.fromMillis(Date.now() - DAYS * 86_400_000));
  const on = !!(firestore && storeId && enabled);

  const receivedQ = useMemoFirebase(() => (on ? query(collection(firestore!, 'orders'), where('storeId', '==', storeId), where('createdAt', '>=', from), orderBy('createdAt', 'desc')) : null), [on, firestore, storeId, from]);
  const rejectedQ = useMemoFirebase(() => (on ? query(collection(firestore!, 'orders'), where('storeId', '==', storeId), where('storeDecision', '==', 'rejected'), where('createdAt', '>=', from), orderBy('createdAt', 'desc')) : null), [on, firestore, storeId, from]);
  const timeoutQ = useMemoFirebase(() => (on ? query(collection(firestore!, 'orders'), where('storeId', '==', storeId), where('storeDecision', '==', 'timeout'), where('createdAt', '>=', from), orderBy('createdAt', 'desc')) : null), [on, firestore, storeId, from]);
  const confirmedQ = useMemoFirebase(() => (on ? query(collection(firestore!, 'orders'), where('storeId', '==', storeId), where('storeDecision', '==', 'confirmed'), where('createdAt', '>=', from)) : null), [on, firestore, storeId, from]);

  const received = useCountFromServer(receivedQ);
  const rejected = useCountFromServer(rejectedQ);
  const timeouts = useCountFromServer(timeoutQ);
  const confirmed = useAggregate(confirmedQ, { n: count(), avg: average('confirmSeconds') });

  const confirmedN = confirmed.data ? confirmed.data.n : null;
  const rate = acceptanceRate(confirmedN, rejected.count, timeouts.count);
  const failed = !!(received.error || rejected.error || timeouts.error || confirmed.error);
  const loading = received.count === null || rejected.count === null || timeouts.count === null || (confirmed.isLoading && !confirmed.data);

  const show = (v: number | null) => (failed ? '—' : v === null ? '…' : String(v));
  const rateTone = rate === null ? 'text-foreground' : rate >= 90 ? 'text-success' : rate >= 75 ? 'text-warning' : 'text-destructive';

  const tiles = [
    { key: 'received', label: 'Recibidos', value: show(received.count), icon: Inbox, tone: 'text-foreground' },
    { key: 'confirmed', label: 'Confirmados', value: show(confirmedN), icon: CheckCircle2, tone: 'text-success' },
    { key: 'rejected', label: 'Rechazados', value: show(rejected.count), icon: XCircle, tone: 'text-destructive' },
    { key: 'timeout', label: 'No confirmados a tiempo', value: show(timeouts.count), icon: TimerOff, tone: 'text-warning' },
    { key: 'rate', label: 'Tasa de aceptación', value: failed ? '—' : loading ? '…' : rate === null ? 'Sin datos' : `${rate.toLocaleString('es-AR')} %`, icon: Percent, tone: rateTone },
    { key: 'avg', label: 'Tiempo prom. de confirmación', value: failed ? '—' : loading ? '…' : fmtConfirmSeconds(confirmed.data?.avg ?? null), icon: Clock, tone: 'text-info' },
  ];

  return (
    <Card className="min-w-0 overflow-hidden" data-testid="store-compliance">
      <CardHeader className="pb-3">
        <CardTitle className="font-headline text-2xl font-extrabold">{variant === 'owner' ? 'Tu cumplimiento, últimos 30 días' : 'Cumplimiento del comercio, últimos 30 días'}</CardTitle>
        <CardDescription>
          {variant === 'owner'
            ? 'Cuántos pedidos aceptás y qué tan rápido. Confirmar a tiempo evita que el pedido se cancele solo y que el cliente se vaya a otra tienda.'
            : 'Aceptación y tiempos de la tienda. Solo se mide: no hay penalizaciones automáticas.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map(({ key, label, value, icon: Icon, tone }) => (
            <div key={key} className="min-w-0 rounded-2xl bg-foreground/[0.05] p-3" data-testid={`compliance-${key}`} aria-busy={value === '…'}>
              <Icon className={cn('mb-1.5 h-5 w-5', tone)} aria-hidden="true" />
              <div className={cn('truncate font-headline text-2xl font-extrabold leading-tight tabular-nums', tone)}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {failed
            ? 'No se pudo calcular (puede faltar un índice de Firestore). Avisale a soporte.'
            : 'La tasa se calcula sobre los pedidos que la tienda tuvo que decidir (confirmados + rechazados + no confirmados a tiempo). Se mide desde noviembre de 2026.'}
        </p>
      </CardContent>
    </Card>
  );
}
