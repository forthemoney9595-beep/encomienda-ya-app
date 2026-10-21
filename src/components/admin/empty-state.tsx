'use client';

import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/** Estado vacío único del panel admin (reemplaza los "Sin datos." sueltos). */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12', className)}>
      <span className={cn('flex items-center justify-center rounded-full bg-muted text-muted-foreground', compact ? 'h-9 w-9' : 'h-12 w-12')}>
        <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <p className={cn('font-medium text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
