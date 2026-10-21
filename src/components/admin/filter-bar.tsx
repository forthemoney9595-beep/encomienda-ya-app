'use client';

import { useMemo, useState } from 'react';
import { Info, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface FilterChip { value: string; label: string; count?: number | null }
export interface FilterSelectOption { value: string; label: string }
export interface FilterSelect {
  key: string;
  label: string;
  options: FilterSelectOption[];
  value: string;
  onChange: (v: string) => void;
  /** Valor que significa "sin filtro" (default 'all'). */
  allValue?: string;
  allLabel?: string;
  disabled?: boolean;
  hint?: string;
}
export type DateRangePreset = '7d' | '30d' | 'month' | 'all';
export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = { '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', month: 'Este mes', all: 'Todo el historial' };

export interface FilterBarProps {
  chips?: FilterChip[];
  chipValue?: string;
  onChipChange?: (v: string) => void;
  selects?: FilterSelect[];
  dateRange?: { value: DateRangePreset; onChange: (v: DateRangePreset) => void; options?: DateRangePreset[] };
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    /** OBLIGATORIO aclarar el alcance: 'server' busca en toda la base (por ID/prefijo); 'page' solo en esta página. */
    scope: 'server' | 'page' | 'mixed';
    hint: string;
    busy?: boolean;
  };
  onClear?: () => void;
  /** Contenido extra a la derecha (botones). */
  extra?: React.ReactNode;
  className?: string;
}

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count?: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors',
        active ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-admin-row-hover',
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn('text-xs tabular-nums', active ? 'opacity-90' : 'text-muted-foreground')} aria-busy={count === null || undefined}>
          {count === null ? '…' : count.toLocaleString('es-AR')}
        </span>
      )}
    </button>
  );
}

/**
 * Barra de filtros única del admin: chips (con conteo real, "…" mientras carga), selects,
 * rango de fecha, búsqueda con ACLARACIÓN DE ALCANCE y contador de filtros activos. En
 * celular los chips scrollean horizontal y selects/fecha van en un Sheet "Filtros (N)".
 */
export function FilterBar(props: FilterBarProps) {
  const { chips, chipValue, onChipChange, selects = [], dateRange, search, onClear, extra, className } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeCount = useMemo(() => {
    let n = 0;
    selects.forEach(s => { if (s.value !== (s.allValue ?? 'all')) n++; });
    if (dateRange && dateRange.value !== '30d') n++;
    if (chips && chipValue && chipValue !== 'all') n++;
    if (search?.value.trim()) n++;
    return n;
  }, [selects, dateRange, chips, chipValue, search?.value]);

  const dateOptions = dateRange?.options ?? (['7d', '30d', 'month', 'all'] as DateRangePreset[]);

  const selectControls = (vertical: boolean) => (
    <>
      {dateRange && (
        <div className={cn(vertical ? 'space-y-1.5' : 'min-w-[150px]')}>
          {vertical && <Label>Período</Label>}
          <Select value={dateRange.value} onValueChange={(v) => dateRange.onChange(v as DateRangePreset)}>
            <SelectTrigger className="h-9 text-[13px]" aria-label="Rango de fechas"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dateOptions.map(o => <SelectItem key={o} value={o}>{DATE_RANGE_LABELS[o]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {selects.map(s => (
        <div key={s.key} className={cn(vertical ? 'space-y-1.5' : 'min-w-[160px] max-w-[220px]')}>
          {vertical && <Label>{s.label}</Label>}
          <Select value={s.value} onValueChange={s.onChange} disabled={s.disabled}>
            <SelectTrigger className="h-9 text-[13px]" aria-label={s.label} title={s.hint}><SelectValue placeholder={s.label} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={s.allValue ?? 'all'}>{s.allLabel ?? `Todas: ${s.label.toLowerCase()}`}</SelectItem>
              {s.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {vertical && s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
        </div>
      ))}
    </>
  );

  return (
    <div className={cn('min-w-0 space-y-2 overflow-hidden rounded-lg border border-border bg-card p-3', className)} data-testid="filter-bar">
      {chips && chips.length > 0 && (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 no-scrollbar" role="group" aria-label="Filtros rápidos">
          {chips.map(c => (
            <Chip key={c.value} active={chipValue === c.value} label={c.label} count={c.count} onClick={() => onChipChange?.(c.value)} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Escritorio: selects inline */}
        {(dateRange || selects.length > 0) && (
          <div className="hidden flex-wrap items-center gap-2 md:flex">{selectControls(false)}</div>
        )}
        {/* Celular: Sheet con contador */}
        {(dateRange || selects.length > 0) && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 md:hidden" aria-label="Abrir filtros">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
              <div className="space-y-4 py-4">{selectControls(true)}</div>
              <div className="flex gap-2">
                {onClear && <Button type="button" variant="ghost" className="flex-1" onClick={() => { onClear(); setSheetOpen(false); }}>Limpiar</Button>}
                <Button type="button" className="flex-1" onClick={() => setSheetOpen(false)}>Listo</Button>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {search && (
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Buscar…'}
              aria-label={search.placeholder ?? 'Buscar'}
              className="h-9 pl-9 pr-9 text-[13px]"
              aria-busy={search.busy || undefined}
            />
            {search.value && (
              <button type="button" onClick={() => search.onChange('')} aria-label="Borrar búsqueda" className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-admin-row-hover">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {activeCount > 0 && onClear && (
          <Button type="button" variant="ghost" size="sm" className="hidden h-9 gap-1 text-muted-foreground md:inline-flex" onClick={onClear}>
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar ({activeCount})
          </Button>
        )}
        {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
      </div>

      {search?.hint && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" aria-hidden="true" /> {search.hint}
        </p>
      )}
    </div>
  );
}
