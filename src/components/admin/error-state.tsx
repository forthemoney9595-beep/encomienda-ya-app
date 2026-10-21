'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Traduce los códigos de Firestore/red a algo que el admin pueda accionar. Hoy los errores de
 * listener se tragan: `useCollection` ya expone `error` (Tanda 3.1) y nadie lo renderizaba.
 */
export function describeError(error: unknown): { title: string; detail?: string; code?: string } {
  const e = error as { code?: string; message?: string } | null | undefined;
  const code = e?.code;
  if (code === 'failed-precondition') {
    return { code, title: 'Falta un índice de Firestore', detail: 'Esta consulta necesita un índice que todavía no está desplegado. El link para crearlo está en la consola del navegador.' };
  }
  if (code === 'permission-denied') {
    return { code, title: 'Sin permiso para leer esto', detail: 'Las reglas de Firestore rechazaron la consulta. Si sos admin, puede que la sesión haya vencido: volvé a entrar.' };
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return { code, title: 'Sin conexión con Firestore', detail: 'Revisá la red y reintentá.' };
  }
  if (code === 'resource-exhausted') {
    return { code, title: 'Cuota de Firestore agotada', detail: 'Se superó la cuota diaria de lecturas. Vuelve a funcionar al cambiar el día (hora del Pacífico).' };
  }
  return { code, title: 'No se pudo cargar', detail: e?.message ? String(e.message).slice(0, 200) : undefined };
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorState({ error, onRetry, compact, className }: ErrorStateProps) {
  const { title, detail, code } = describeError(error);
  if (compact) {
    return (
      <div role="alert" className={cn('flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm', className)}>
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive-ink" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{title}</span>{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}</span>
        {onRetry && (
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reintentar
          </Button>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-ink">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="font-medium">{title}</p>
      {detail && <p className="max-w-md text-sm text-muted-foreground">{detail}</p>}
      {code && <p className="text-xs text-muted-foreground/70">código: {code}</p>}
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reintentar
        </Button>
      )}
    </div>
  );
}
