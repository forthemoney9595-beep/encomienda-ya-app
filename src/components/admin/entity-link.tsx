'use client';

import { useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { Copy, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { UserDetailDialog } from '@/app/admin/users/user-detail-dialog';

export type EntityType = 'store' | 'driver' | 'user' | 'order';

export interface EntityLinkProps {
  type: EntityType;
  id: string | null | undefined;
  label?: React.ReactNode;
  secondary?: React.ReactNode;
  /** Abre el diálogo rápido (ficha del cliente) en vez de navegar. Solo type='user'. */
  quick?: boolean;
  className?: string;
  /** Abre en pestaña nueva. */
  newTab?: boolean;
}

export function entityHref(type: EntityType, id: string): string {
  switch (type) {
    case 'store': return `/admin/stores/${id}`;
    case 'driver': return `/admin/delivery/${id}`;
    case 'user': return `/admin/users?q=${encodeURIComponent(id)}`;
    case 'order': return `/admin/orders/${id}`;
  }
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard?.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}
      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md hover:bg-admin-row-hover"
      aria-label="Copiar ID"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success-ink" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}

/**
 * Link a una entidad con tooltip (ID completo + copiar). Reemplaza los nombres sueltos sin
 * link en pedidos/reclamos/incidentes/log. Para clientes, `quick` abre la ficha encima de
 * la página (patrón del ⌘K de la Fase GG) en vez de navegar.
 */
export function EntityLink({ type, id, label, secondary, quick, className, newTab }: EntityLinkProps) {
  const { toast } = useToast();
  const [quickUser, setQuickUser] = useState<Record<string, unknown> | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(false);

  if (!id) return <span className={cn('text-muted-foreground', className)}>{label ?? '—'}</span>;

  const text = label ?? (type === 'order' ? `#${id.slice(0, 7)}` : id.slice(0, 8));
  const linkCls = cn(
    'inline-flex min-h-[36px] max-w-full items-center gap-1 rounded-sm text-left font-medium text-foreground underline-offset-2 hover:text-primary-ink hover:underline',
    type === 'order' && 'font-mono text-primary-ink',
    className,
  );

  const openQuick = async () => {
    if (loadingQuick) return;
    setLoadingQuick(true);
    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) {
        toast({ variant: 'destructive', title: 'Usuario no encontrado', description: 'La cuenta ya no existe (pudo haberse eliminado).' });
        return;
      }
      setQuickUser({ id: snap.id, ...snap.data() });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo abrir la ficha' });
    } finally {
      setLoadingQuick(false);
    }
  };

  const inner = (
    <>
      <span className="truncate">{text}</span>
      {secondary ? <span className="truncate text-xs font-normal text-muted-foreground">{secondary}</span> : null}
    </>
  );

  const trigger = quick && type === 'user'
    ? <button type="button" onClick={openQuick} className={linkCls} aria-busy={loadingQuick || undefined}>{inner}</button>
    : <Link href={entityHref(type, id)} className={linkCls} target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined}>{inner}</Link>;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="top" className="flex items-center gap-1 font-mono text-xs">
            <span className="select-all">{id}</span>
            <CopyId id={id} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {quick && type === 'user' && <UserDetailDialog user={quickUser} onClose={() => setQuickUser(null)} />}
    </>
  );
}
