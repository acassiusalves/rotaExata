'use client';
import { Header } from '@/components/layout/header';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import React from 'react';
import { Loader2 } from 'lucide-react';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  
  const publicRoutes = ['/login'];
  const isPublicPage = publicRoutes.includes(pathname);

  React.useEffect(() => {
    if (!loading && !user && !isPublicPage) {
      router.push('/login');
    }
  }, [loading, user, isPublicPage, router]);

  if (loading && !isPublicPage) {
     return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-3 text-lg">Carregando...</span>
      </div>
    );
  }

  if (isPublicPage) {
    return <>{children}</>;
  }

  if (!user) return null; // ou um loader

  // Special layout for new route page
  const isFullHeightPage = ['/routes/new', '/routes/organize'].includes(pathname);

  if (isFullHeightPage) {
     return (
      <div className="flex h-screen w-full flex-col">
        <Header />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-8">
        {children}
      </main>
    </div>
  );
}
