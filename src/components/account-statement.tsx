'use client';

// Estado de cuenta de una tienda o repartidor (Fase OO) — la vista "historia completa"
// que les faltaba a las fichas del admin: cada peso que la cuenta ganó (pedidos netos
// según money.ts), cada peso que se le pagó (retiros aprobados con comprobante) y lo que
// está en el medio (solicitudes pendientes/rechazadas), en una sola línea de tiempo.
// Las páginas arman los movimientos con SUS funciones de reparto (storeNetForOrder /
// driverNetForOrder) y este componente solo ordena, totaliza y exporta — así no se
// duplica ninguna fórmula (la lección de money.ts).

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { downloadCsv } from '@/lib/csv-export';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, ExternalLink, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatementMovement {
  id: string;
  date: any; // Timestamp | Date
  label: string;
  detail?: string;
  // Monto con signo: + lo que la cuenta ganó, − lo que se le pagó. Los movimientos con
  // `badge` (solicitud pendiente/rechazada) son informativos: muestran su monto en gris
  // pero NO mueven los totales — los totales los calcula la página, no este componente.
  amount: number;
  tone: 'in' | 'out' | 'muted';
  badge?: string;
  href?: string;
}

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;

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
}: {
  movements: StatementMovement[];
  summary: { earned: number; paid: number; requested: number; balance: number; debt: number };
  // true cuando la ventana de pedidos cargada tocó su límite: los totales dejan de ser
  // el histórico completo y hay que decirlo (misma honestidad que las métricas de arriba).
  capReached?: boolean;
  csvName: string;
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

  const chips = [
    { label: 'Ganado', value: summary.earned, cls: 'text-success' },
    { label: 'Pagado', value: -summary.paid, cls: 'text-info' },
    { label: 'Solicitado (pendiente)', value: summary.requested, cls: 'text-warning' },
    summary.debt > 0
      ? { label: 'Pagado de más', value: summary.debt, cls: 'text-destructive' }
      : { label: 'Saldo a favor', value: summary.balance, cls: 'text-primary' },
  ];

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="h-4 w-4 text-primary" /> Estado de cuenta
          </CardTitle>
          <CardDescription>
            Cada movimiento de plata de esta cuenta: lo ganado por pedido (neto, con la
            misma fórmula que aprueba los retiros), lo pagado y lo solicitado.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={sorted.length === 0} className="shrink-0 gap-1.5">
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {chips.map(({ label, value, cls }) => (
            <div key={label} className="rounded-lg border bg-muted/30 p-2.5">
              <div className={cn('text-lg font-bold', cls)}>
                {value < 0 ? `−${money(value)}` : money(value)}
              </div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {capReached && (
          <p className="text-[11px] text-warning">
            ⚠ Se cargó el máximo de pedidos de la ventana — los totales cubren esos
            movimientos, no todo el histórico.
          </p>
        )}

        <div className="divide-y divide-border/60 rounded-lg border">
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos todavía.</p>
          )}
          {sorted.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground whitespace-nowrap w-24 shrink-0">
                {format(toDate(m.date), 'd MMM yyyy', { locale: es })}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{m.label}</p>
                {m.detail && <p className="text-[11px] text-muted-foreground truncate">{m.detail}</p>}
              </div>
              <span className={cn('font-bold whitespace-nowrap tabular-nums',
                m.tone === 'in' ? 'text-success' : m.tone === 'out' ? 'text-info' : 'text-muted-foreground')}>
                {m.amount > 0 ? '+' : m.amount < 0 ? '−' : ''}{money(m.amount)}
              </span>
              {m.badge && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">{m.badge}</Badge>
              )}
              {m.href && (
                <Link href={m.href} target="_blank" className="shrink-0">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3" /></Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
