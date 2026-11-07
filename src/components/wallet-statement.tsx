'use client';

// Estado de cuenta + día de cobro en la BILLETERA de la tienda y del repartidor (Fase YY bis,
// puntos 1 y 2 de la nota de Rappi/PedidosYa). Mismo componente y mismas fórmulas que la
// ficha del admin (`AccountStatement` + `src/lib/account-movements.ts` → money.ts).
//
// Consultas ACOTADAS por rango: el período elegido (90 días por defecto) con `limit`, nunca
// todo el historial. El saldo TOTAL no se recalcula acá: lo pasa la página, que lo saca de
// donde siempre (misma fórmula que aprueba los retiros).
//
// Facturación de la comisión (ARCA): NO se emite desde la app — es tema del contador. Cuando
// se cobre de verdad, la factura de la comisión de cada semana va junto a este resumen.

import { useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, Timestamp, where, type Query } from 'firebase/firestore';
import { CalendarClock, Download, Loader2 } from 'lucide-react';
import { db, useCollection, useMemoFirebase } from '@/lib/firebase';
import { AccountStatement } from '@/components/account-statement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { downloadCsv } from '@/lib/csv-export';
import { money } from '@/lib/format-money';
import { nowInArgentina } from '@/lib/store-hours';
import { monthBoundsART, nextSettlement, weekBoundsART } from '@/lib/settlement-calendar';
import {
  buildDriverStatement, buildStoreStatement, driverWeeklyCsvRows, ordersInRange, statementWithdrawalMs,
  storeWeeklyCsvRows, type StatementOrder, type StatementWithdrawal,
} from '@/lib/account-movements';
import { useToast } from '@/hooks/use-toast';

/** Tope de pedidos por período (defensivo; con más, la UI lo avisa). */
const PERIOD_CAP = 500;
/** Un pedido puede crearse un día y entregarse al siguiente: la consulta (por createdAt) arranca antes. */
const CREATED_BUFFER_MS = 3 * 86_400_000;
const WEEKS_FOR_CSV = 8;

type Period = '90d' | 'week' | 'prevWeek' | 'month' | 'prevMonth';
const PERIOD_LABELS: Record<Period, string> = {
  '90d': 'Últimos 90 días', week: 'Esta semana', prevWeek: 'Semana pasada', month: 'Este mes', prevMonth: 'Mes pasado',
};

function periodBounds(p: Period, nowMs: number): { fromMs: number; toMs: number } {
  if (p === 'week') return weekBoundsART(nowMs, 0);
  if (p === 'prevWeek') return weekBoundsART(nowMs, -1);
  if (p === 'month') return monthBoundsART(nowMs, 0);
  if (p === 'prevMonth') return monthBoundsART(nowMs, -1);
  return { fromMs: nowMs - 90 * 86_400_000, toMs: nowMs + 60_000 };
}

export interface WalletStatementProps {
  role: 'store' | 'delivery';
  /** uid del repartidor (role delivery). */
  uid?: string;
  /** id de la tienda (role store). */
  storeId?: string;
  /** Comisión por defecto para pedidos sin comisión congelada (la misma que usa el saldo). */
  fallbackRate: number;
  /** Retiros de la cuenta (la página ya los tiene: set acotado por usuario y rol). */
  withdrawals: StatementWithdrawal[];
  /** Saldo disponible HOY y deuda, calculados por la página (no se recalculan acá). */
  balance: number;
  debt: number;
  settlementDayOfWeek?: number;
  hasCbu: boolean;
  /** `ready ? query : null` (ARQ-010): no consultar hasta confirmar el rol. */
  ready: boolean;
}

export function WalletStatement(props: WalletStatementProps) {
  const { role, uid, storeId, fallbackRate, withdrawals, balance, debt, settlementDayOfWeek, hasCbu, ready } = props;
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>('90d');
  // El "ahora" queda fijo por período elegido (no por render): así la consulta es estable.
  const bounds = useMemo(() => periodBounds(period, Date.now()), [period]);
  const ownerField = role === 'store' ? 'storeId' : 'deliveryPersonId';
  const ownerValue = role === 'store' ? storeId : uid;

  const buildRangeQuery = (fromMs: number, toMs: number, cap: number): Query =>
    query(
      collection(db, 'orders'),
      where(ownerField, '==', ownerValue),
      where('status', '==', 'Entregado'),
      where('createdAt', '>=', Timestamp.fromMillis(fromMs - CREATED_BUFFER_MS)),
      where('createdAt', '<', Timestamp.fromMillis(toMs)),
      // orderBy desc: usa los índices (storeId|deliveryPersonId, status, createdAt DESC) que
      // ya existen — un rango sin orderBy pediría el ASC.
      orderBy('createdAt', 'desc'),
      limit(cap),
    );

  const periodQuery = useMemoFirebase<Query | null>(
    () => (ready && ownerValue ? buildRangeQuery(bounds.fromMs, bounds.toMs, PERIOD_CAP) : null),
    [ready, ownerValue, ownerField, bounds.fromMs, bounds.toMs],
  );
  const { data: rawOrders, isLoading } = useCollection<StatementOrder>(periodQuery);
  const capReached = rawOrders.length >= PERIOD_CAP;

  const statement = useMemo(() => {
    const orders = ordersInRange(rawOrders, bounds.fromMs, bounds.toMs);
    // Retiros: pagados/rechazados del período; los PENDIENTES siempre (son lo que está en curso).
    const ws = withdrawals.filter(w => w.status === 'pending' || (statementWithdrawalMs(w) >= bounds.fromMs && statementWithdrawalMs(w) < bounds.toMs));
    const built = role === 'store'
      ? buildStoreStatement(orders, ws, fallbackRate, { audience: 'self', orderHref: id => `/orders/${id}` })
      : buildDriverStatement(orders, ws, { audience: 'self', orderHref: id => `/orders/${id}` });
    return { ...built, summary: { ...built.summary, balance, debt } };
  }, [rawOrders, bounds, withdrawals, role, fallbackRate, balance, debt]);

  // ── Próxima liquidación (hora Argentina) ──
  const next = useMemo(() => nextSettlement(nowInArgentina(), settlementDayOfWeek), [settlementDayOfWeek]);

  // ── Resumen semanal (lunes a domingo, hora Argentina) ──
  const weeks = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: WEEKS_FOR_CSV }, (_, i) => ({ offset: -i, ...weekBoundsART(now, -i) }));
  }, []);
  const [weekOffset, setWeekOffset] = useState('-1');
  const [downloading, setDownloading] = useState(false);
  const downloadWeek = async () => {
    const wk = weeks.find(w => String(w.offset) === weekOffset);
    if (!wk || !ownerValue) return;
    setDownloading(true);
    try {
      const snap = await getDocs(buildRangeQuery(wk.fromMs, wk.toMs, PERIOD_CAP));
      const orders = ordersInRange(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StatementOrder), wk.fromMs, wk.toMs);
      const { rows, totalNet } = role === 'store' ? storeWeeklyCsvRows(orders, fallbackRate) : driverWeeklyCsvRows(orders);
      downloadCsv(rows, `resumen-semanal_${role === 'store' ? 'tienda' : 'repartidor'}_${wk.mondayId}.csv`);
      toast({ title: 'Resumen descargado', description: `${wk.label}: ${orders.length} ${role === 'store' ? 'pedidos' : 'entregas'} · neto ${money(totalNet)}` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo armar el resumen', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="wallet-statement">
      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex gap-3 p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold" data-testid="next-settlement">
              Próxima liquidación: {next.isToday ? 'hoy, ' : ''}{next.label}
            </p>
            <p className="text-muted-foreground">
              Ese día se genera sola una solicitud de pago por tu saldo disponible. La plata se
              acredita cuando el administrador la aprueba y transfiere (te llega un aviso con el comprobante).
            </p>
            {hasCbu
              ? <p className="text-xs text-success">✓ Tenés un CBU/alias cargado para recibir la liquidación.</p>
              : <p className="text-xs text-warning" data-testid="no-cbu">Todavía no tenés CBU cargado: hacé un retiro manual una vez y queda guardado para las próximas liquidaciones.</p>}
          </div>
        </CardContent>
      </Card>

      <AccountStatement
        movements={statement.movements}
        summary={statement.summary}
        capReached={capReached}
        csvName={`estado-de-cuenta_${role === 'store' ? 'tienda' : 'repartidor'}_${period}.csv`}
        periodLabel={PERIOD_LABELS[period]}
        balanceLabel="Saldo disponible hoy"
        description={role === 'store'
          ? 'Cada pedido entregado con lo que te queda (venta − comisión − reembolsos que absorbiste), cada pago que recibiste y lo solicitado. Misma cuenta que usa el administrador para aprobar tus retiros.'
          : 'Cada entrega con lo que te queda (envío − reembolsos que absorbiste), cada pago que recibiste y lo solicitado. Misma cuenta que usa el administrador para aprobar tus retiros.'}
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="statement-period" className="text-xs text-muted-foreground">Período</Label>
              <Select value={period} onValueChange={v => setPeriod(v as Period)}>
                <SelectTrigger id="statement-period" className="h-10 w-full sm:w-52" data-testid="statement-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIOD_LABELS) as Period[]).map(p => <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 sm:items-end">
              <Label htmlFor="weekly-csv-week" className="text-xs text-muted-foreground">Resumen semanal (lunes a domingo)</Label>
              <div className="flex gap-2">
                <Select value={weekOffset} onValueChange={setWeekOffset}>
                  <SelectTrigger id="weekly-csv-week" className="h-10 min-w-0 flex-1 sm:w-48" data-testid="weekly-csv-week"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {weeks.map(w => <SelectItem key={w.offset} value={String(w.offset)}>{w.offset === 0 ? `Esta semana (${w.label})` : w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5" onClick={downloadWeek} disabled={downloading || !ready} data-testid="weekly-csv">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                  Descargar
                </Button>
              </div>
            </div>
          </div>
        }
        footer={
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Cargando movimientos…' : `${PERIOD_LABELS[period]} · por fecha de entrega, hora Argentina.`} El saldo disponible es el total de hoy, no solo el del período.
          </p>
        }
      />
    </div>
  );
}
