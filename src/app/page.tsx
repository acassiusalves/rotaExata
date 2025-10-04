
'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import React from 'react';
import { Loader2 } from 'lucide-react';

// This page acts as a router based on user role.
export default function Page() {
  const router = useRouter();
  const { userRole, loading } = useAuth();

  React.useEffect(() => {
    if (loading) {
      return; // Wait until authentication state is resolved
    }

    if (userRole === 'admin' || userRole === 'vendedor') {
      router.replace('/dashboard');
    } else if (userRole === 'driver') {
      router.replace('/my-routes');
    } else {
      // If no role or not logged in, go to login
      router.replace('/login');
    }
  }, [userRole, loading, router]);

  // Show a loading spinner while redirecting
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
