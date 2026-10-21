'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Ellipsis, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { downloadCsv } from '@/lib/csv-export';
import { fmtElapsed } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { EmptyState, type EmptyStateProps } from './empty-state';
import { ErrorState } from './error-state';

export interface DataColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** En < 768 px la tabla pasa a tarjetas; esta prop solo afecta si se fuerza modo tabla. */
  hideOnMobile?: boolean;
  className?: string;
}

export interface RowAction<T> {
  label: React.ReactNode;
  onClick?: (row: T) => void | Promise<void>;
  href?: string;
  newTab?: boolean;
  tone?: 'default' | 'destructive' | 'success' | 'warning';
  disabled?: boolean;
  /** Separador antes de esta acción. */
  separatorBefore?: boolean;
  icon?: React.ReactNode;
}

export interface MobileCard {
  title: React.ReactNode;
  badge?: React.ReactNode;
  secondary?: React.ReactNode;
  right?: React.ReactNode;
  href?: string;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  rangeFrom: number;
  rangeTo: number;
}

export type CsvRow = Record<string, string | number | null | undefined>;

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  getMobileCard?: (row: T) => MobileCard;
  rowActions?: (row: T) => RowAction<T>[];
  pagination?: DataTablePagination;
  /** Recorre TODO lo filtrado (cursor server-side) y devuelve filas planas para el CSV. */
  onExportCsv?: () => Promise<{ rows: CsvRow[]; capped?: boolean }>;
  csvFilename?: string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: EmptyStateProps;
  /** "Mostrando 1-25 de 318 pedidos": sustantivo para el contador. */
  noun?: string;
  density?: 'normal' | 'compact';
  className?: string;
  /** Encabezado opcional sobre la tabla (título + acciones). */
  header?: React.ReactNode;
  /** Timestamp del último fetch → "Actualizado hace N · Refrescar". */
  refreshedAt?: number | null;
  rowClassName?: (row: T) => string | undefined;
  testId?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function ActionsMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label="Acciones">
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {actions.map((a, i) => {
          const cls = cn(
            'min-h-[36px] cursor-pointer gap-2',
            a.tone === 'destructive' && 'text-destructive-ink focus:text-destructive-ink',
            a.tone === 'success' && 'text-success-ink focus:text-success-ink',
            a.tone === 'warning' && 'text-warning-ink focus:text-warning-ink',
          );
          return (
            <span key={i}>
              {a.separatorBefore && <DropdownMenuSeparator />}
              {a.href ? (
                <DropdownMenuItem asChild disabled={a.disabled} className={cls}>
                  <a href={a.href} target={a.newTab ? '_blank' : undefined} rel={a.newTab ? 'noreferrer' : undefined}>{a.icon}{a.label}</a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled={a.disabled} className={cls} onSelect={() => { void a.onClick?.(row); }}>
                  {a.icon}{a.label}
                </DropdownMenuItem>
              )}
            </span>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * DataTable del admin: tabla densa en escritorio (filas de 44 px, celdas de 13 px, cabeceras
 * de 12 px), tarjetas en < 768 px (nunca scroll horizontal dentro de la tarjeta), menú ⋯ por
 * fila, paginación Anterior/Siguiente con total real y CSV de TODO lo filtrado.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns, rows, rowKey, getMobileCard, rowActions, pagination, onExportCsv, csvFilename = 'export.csv',
    loading, error, onRetry, empty, noun = 'filas', density = 'normal', className, header, refreshedAt, rowClassName, testId,
  } = props;
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const rowH = density === 'compact' ? 'h-10' : 'h-11';

  const handleExport = async () => {
    if (!onExportCsv) return;
    setExporting(true);
    try {
      const { rows: csvRows, capped } = await onExportCsv();
      if (csvRows.length === 0) { toast({ title: 'Nada para exportar', description: 'El filtro actual no tiene filas.' }); return; }
      downloadCsv(csvRows, csvFilename);
      toast({
        title: `CSV descargado · ${csvRows.length.toLocaleString('es-AR')} ${noun}`,
        description: capped ? 'Se exportaron las primeras 5.000 filas (tope). Acotá el filtro para bajar el resto.' : 'Incluye todo lo que matchea el filtro, no solo esta página.',
      });
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'No se pudo exportar', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  };

  const totalPages = pagination
    ? (typeof pagination.total === 'number' ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : pagination.page + 1 + (pagination.hasMore ? 1 : 0))
    : 1;

  const counter = pagination ? (
    loading ? 'Cargando…' : rows.length === 0 ? `0 ${noun}` : (
      <>Mostrando {pagination.rangeFrom}-{pagination.rangeTo}{typeof pagination.total === 'number' ? ` de ${pagination.total.toLocaleString('es-AR')}` : ''} {noun}{totalPages > 1 ? ` · página ${pagination.page + 1} de ${totalPages}` : ''}</>
    )
  ) : null;

  const toolbar = (header || onExportCsv || refreshedAt) && (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
      <div className="min-w-0 text-sm text-muted-foreground">{header ?? counter}</div>
      <div className="flex items-center gap-1">
        {refreshedAt && onRetry && (
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={onRetry} title="Volver a consultar">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Actualizado hace {fmtElapsed(Date.now() - refreshedAt)}</span>
            <span className="sm:hidden">Refrescar</span>
          </Button>
        )}
        {onExportCsv && (
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExport} disabled={exporting || loading} data-testid="csv-export">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
            CSV <span className="hidden sm:inline">(todo lo filtrado)</span>
          </Button>
        )}
      </div>
    </div>
  );

  const body = () => {
    if (error) return <ErrorState error={error} onRetry={onRetry} />;
    if (loading && rows.length === 0) {
      return (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      );
    }
    if (rows.length === 0) return <EmptyState {...empty} />;
    return (
      <>
        {/* Tabla (≥ 768 px) */}
        <div className={cn('hidden overflow-x-auto md:block', loading && 'opacity-60')} aria-busy={loading || undefined}>
          <table className="w-full border-separate border-spacing-0 text-[13px]" data-testid={testId}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} style={c.width ? { width: c.width } : undefined}
                    className={cn('whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground', ALIGN[c.align ?? 'left'], c.className)}>
                    {c.header}
                  </th>
                ))}
                {rowActions && <th className="w-12 border-b border-border px-2 py-2.5"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={rowKey(row)} className={cn('group transition-colors hover:bg-admin-row-hover', rowClassName?.(row))}>
                  {columns.map(c => (
                    <td key={c.key} className={cn(rowH, 'border-b border-border px-3 align-middle', ALIGN[c.align ?? 'left'], c.align === 'right' && 'tabular-nums', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className={cn(rowH, 'border-b border-border px-1 text-right align-middle')}>
                      <ActionsMenu row={row} actions={rowActions(row)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Tarjetas (< 768 px) */}
        <ul className={cn('divide-y divide-border md:hidden', loading && 'opacity-60')} aria-busy={loading || undefined} data-testid={testId ? `${testId}-cards` : undefined}>
          {rows.map(row => {
            const card = getMobileCard ? getMobileCard(row) : { title: columns[0]?.cell(row), secondary: columns[1]?.cell(row), right: columns[columns.length - 1]?.cell(row) };
            const content = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{card.title}</span>
                    {card.badge}
                  </div>
                  {card.secondary && <div className="mt-0.5 truncate text-xs text-muted-foreground">{card.secondary}</div>}
                </div>
                {card.right && <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{card.right}</div>}
              </>
            );
            return (
              <li key={rowKey(row)} className={cn('flex min-h-[56px] items-center gap-3 px-3 py-2', rowClassName?.(row))}>
                {card.href ? <a href={card.href} className="flex min-w-0 flex-1 items-center gap-3">{content}</a> : content}
                {rowActions && <ActionsMenu row={row} actions={rowActions(row)} />}
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <div className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-card', className)}>
      {toolbar}
      {body()}
      {pagination && !error && (rows.length > 0 || pagination.page > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground sm:px-4">
          <span className="tabular-nums" data-testid="pagination-counter">{header ? counter : (loading ? 'Cargando…' : counter)}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={pagination.onPrev} disabled={!pagination.hasPrev || !!loading} aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={pagination.onNext} disabled={!pagination.hasMore || !!loading} aria-label="Página siguiente">
              Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
