'use client';
import { Header } from '@/components/layout/header';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import React from 'react';
import { Loader2 } from 'lucide-react';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, userRole } = useAuth();
  
  React.useEffect(() => {
    if (loading) return; // Wait for loading to finish

    if (!user) {
      // If not logged in, redirect to login
      router.push('/login');
      return;
    }

    // If logged in and is admin, they are OK.
    // If not admin, they should not be on admin pages.
    // This is a simple check, a more robust one can be implemented
    // with middleware or more complex logic here.
    if (userRole !== 'admin') {
       // For now, let's just log this. We can redirect to a driver page later.
       console.log('User is not an admin. Role:', userRole);
       // router.push('/driver'); // Example future redirect
    }

  }, [loading, user, userRole, router, pathname]);

  if (loading || !user) {
     return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-3 text-lg">Carregando...</span>
      </div>
    );
  }

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
