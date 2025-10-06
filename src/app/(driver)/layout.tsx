
'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, mustChangePassword } = useAuth();
  const router = useRouter();

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
          {/* A barra de navegação com abas foi removida daqui */}
          {children}
        </div>
      </main>
    </div>
  );
}
