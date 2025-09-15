'use client';
import React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userRole, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
      return;
    }
    
    // Redirect if user is not a driver (using 'vendedor' as driver role)
    if (userRole !== 'vendedor') {
        console.warn(`Admin user tried to access driver area. Redirecting to admin dashboard.`);
        router.push('/');
    }

  }, [loading, user, userRole, router]);

  if (loading || !user || userRole !== 'vendedor') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted">
       {/* Minimal layout for driver - can have its own header/footer later */}
       <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
