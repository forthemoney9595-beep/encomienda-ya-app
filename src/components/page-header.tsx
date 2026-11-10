
'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { ArrowLeft } from 'lucide-react';
import { useSidebar } from './ui/sidebar';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}

const PageHeader = ({ title, description, children }: PageHeaderProps) => {
  const router = useRouter();
  const { isMobile } = useSidebar();
  
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  return (
    // Rediseño en vidrio (9/11/2026): mismo contrato de props; botón de volver de vidrio de
    // 44 px y título en letra de cartel. Lo usan pantallas de todos los roles.
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {canGoBack && isMobile && (
          <Button variant="ghost" size="icon" className="glass h-11 w-11 shrink-0 rounded-2xl" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Volver</span>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="font-headline text-3xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-[2.25rem]">
            {title}
          </h1>
          {description && (
            <div className="mt-1.5 text-base leading-snug text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
};

export default PageHeader;
