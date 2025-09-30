import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}

const PageHeader = ({ title, description, children }: PageHeaderProps) => {
  return (
    <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
      <div className="mb-4 md:mb-0">
        <h1 className="font-headline text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <div className="mt-1 text-muted-foreground">{description}</div>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
};

export default PageHeader;
