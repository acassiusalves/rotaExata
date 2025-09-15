
'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import React from 'react';
import { Loader2 } from 'lucide-react';

// This page acts as a router based on user role.
export default function Page() {
  const { user, userRole, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) {
      // Still loading, do nothing
      return;
    }

    if (!user) {
      router.replace('/login');
    } else if (userRole === 'admin') {
      router.replace('/dashboard');
    } else if (userRole === 'vendedor') {
      router.replace('/my-routes');
    } else {
      // Default fallback or for other roles
      router.replace('/login');
    }
  }, [user, userRole, loading, router]);

  // Show a loading spinner while redirecting
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
