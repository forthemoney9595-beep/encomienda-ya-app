
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
    <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3 mb-4 md:mb-0">
        {canGoBack && isMobile && (
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Volver</span>
          </Button>
        )}
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <div className="mt-1 text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
};

export default PageHeader;
