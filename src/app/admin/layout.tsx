'use client';

// This layout is now purely for structure. 
// The authentication and authorization logic has been moved to the AdminAuthGuard component
// which wraps each individual admin page. This prevents circular dependency issues.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
