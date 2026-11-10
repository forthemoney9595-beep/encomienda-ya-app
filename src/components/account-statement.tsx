'use client';

// Estado de cuenta de una tienda o repartidor (Fase OO) — la vista "historia completa"
// que les faltaba a las fichas del admin: cada peso que la cuenta ganó (pedidos netos
// según money.ts), cada peso que se le pagó (retiros aprobados con comprobante) y lo que
// está en el medio (solicitudes pendientes/rechazadas), en una sola línea de tiempo.
// Las páginas arman los movimientos con SUS funciones de reparto (storeNetForOrder /
// driverNetForOrder) y este componente solo ordena, totaliza y exporta — así no se
// duplica ninguna fórmula (la lección de money.ts).

import { useMemo, type ReactNode } from 'react';
import type { StatementMovement } from '@/lib/account-movements';
import { money as fmtMoney } from '@/lib/format-money';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { downloadCsv } from '@/lib/csv-export';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, ExternalLink, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';

// El tipo vive en src/lib/account-movements.ts (armado puro, compartido con las billeteras).
export type { StatementMovement } from '@/lib/account-movements';

// Importes siempre en valor absoluto: el signo lo pone la fila (ganado/pagado). Formato único de la app.
const money = (n: number) => fmtMoney(Math.abs(n));

const toDate = (ts: any): Date => {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date(ts);
};

export function AccountStatement({
  movements,
  summary,
  capReached,
  csvName,
  title = 'Estado de cuenta',
  description,
  periodLabel,
  balanceLabel,
  toolbar,
  footer,
}: {
  movements: StatementMovement[];
  summary: { earned: number; paid: number; requested: number; balance: number; debt: number };
  // true cuando la ventana de pedidos cargada tocó su límite: los totales dejan de ser
  // el histórico completo y hay que decirlo (misma honestidad que las métricas de arriba).
  capReached?: boolean;
  csvName: string;
  title?: string;
  description?: ReactNode;
  /** Si los movimientos son de un período (billeteras): rotula Ganado/Pagado "en el período". */
  periodLabel?: string;
  /** Rótulo del chip de saldo (en las billeteras el saldo es el TOTAL de hoy, no el del período). */
  balanceLabel?: string;
  /** Controles extra arriba de los chips (selector de período, descarga semanal). */
  toolbar?: ReactNode;
  /** Texto debajo de la lista. */
  footer?: ReactNode;
}) {
  const sorted = useMemo(
    () => [...movements].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime()),
    [movements],
  );

  const handleCsv = () => {
    downloadCsv(sorted.map(m => ({
      Fecha: format(toDate(m.date), 'yyyy-MM-dd HH:mm'),
      Concepto: m.label,
      Detalle: m.detail || '',
      Estado: m.badge || 'aplicado',
      Monto: Math.round(m.amount),
    })), csvName);
  };

  const inPeriod = periodLabel ? ' en el período' : '';
  const chips = [
    { key: 'earned', label: `Ganado${inPeriod}`, value: summary.earned, cls: 'text-success' },
    { key: 'paid', label: `Pagado${inPeriod}`, value: -summary.paid, cls: 'text-info' },
    { key: 'requested', label: 'Solicitado (pendiente)', value: summary.requested, cls: 'text-warning' },
    summary.debt > 0
      ? { key: 'debt', label: 'Pagado de más', value: summary.debt, cls: 'text-destructive' }
      : { key: 'balance', label: balanceLabel || 'Saldo a favor', value: summary.balance, cls: 'text-primary' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 font-headline text-2xl font-extrabold">
            <ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" /> {title}
          </CardTitle>
          <CardDescription>
            {description ?? 'Cada movimiento de plata de esta cuenta: lo ganado por pedido (neto, con la misma fórmula que aprueba los retiros), lo pagado y lo solicitado.'}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={sorted.length === 0} className="h-10 shrink-0 gap-1.5 rounded-full bg-transparent px-4" aria-label="Descargar movimientos en CSV">
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {toolbar}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {chips.map(({ key, label, value, cls }) => (
            <div key={label} className="min-w-0 rounded-2xl bg-foreground/[0.05] p-3">
              <div className={cn('truncate font-headline text-2xl font-extrabold leading-tight tabular-nums', cls)} data-testid={`statement-chip-${key}`}>
                {value < 0 ? `−${money(value)}` : money(value)}
              </div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {capReached && (
          <p className="text-xs text-warning">
            Se cargó el máximo de pedidos de la ventana — los totales cubren esos
            movimientos, no todo el histórico.
          </p>
        )}

        <div className="divide-y divide-foreground/10 overflow-hidden rounded-2xl bg-foreground/[0.03] ring-1 ring-foreground/10">
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos todavía.</p>
          )}
          {sorted.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm" data-testid="statement-row">
              <span className="text-xs text-muted-foreground whitespace-nowrap w-24 shrink-0">
                {format(toDate(m.date), 'd MMM yyyy', { locale: es })}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{m.label}</p>
                {/* En celular el detalle hace wrap: ahí vive el reembolso absorbido, no puede quedar cortado. */}
                {m.detail && <p className="text-xs text-muted-foreground break-words sm:truncate">{m.detail}</p>}
              </div>
              <span className={cn('font-bold whitespace-nowrap tabular-nums',
                m.tone === 'in' ? 'text-success' : m.tone === 'out' ? 'text-info' : 'text-muted-foreground')}>
                {m.amount > 0 ? '+' : m.amount < 0 ? '−' : ''}{money(m.amount)}
              </span>
              {m.badge && (
                <Badge variant="outline" className="shrink-0 rounded-full text-xs text-muted-foreground">{m.badge}</Badge>
              )}
              {m.href && (
                <Link href={m.href} target="_blank" className="shrink-0">
                  <Button size="sm" variant="ghost" className="h-10 w-10 rounded-full p-0" aria-label="Ver pedido" tabIndex={-1}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                </Link>
              )}
            </div>
          ))}
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}
