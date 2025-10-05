
'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, History, Route } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && mustChangePassword) {
      router.replace('/auth/change-password');
    }
  }, [loading, mustChangePassword, router]);

  if (loading || mustChangePassword) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex-1 bg-muted/40">
        <div className="mx-auto w-full max-w-md">
           <div className="border-b bg-background">
            <div className="flex h-16 items-center px-4">
              <nav className="flex items-center space-x-4 lg:space-x-6">
                <Button
                  variant={pathname === '/my-routes' ? 'secondary' : 'ghost'}
                  asChild
                  className="gap-2"
                >
                  <Link href="/my-routes">
                    <Route className="h-4 w-4" />
                    Rotas Ativas
                  </Link>
                </Button>
                <Button
                  variant={pathname === '/my-routes/history' ? 'secondary' : 'ghost'}
                  asChild
                  className="gap-2"
                >
                  <Link href="/my-routes/history">
                    <History className="h-4 w-4" />
                    Histórico
                  </Link>
                </Button>
              </nav>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
