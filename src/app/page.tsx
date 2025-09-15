
'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import React from 'react';
import { Loader2 } from 'lucide-react';

// This page acts as a router based on user role.
export default function Page() {
  const router = useRouter();

  React.useEffect(() => {
    // Simply redirect to the main dashboard as roles are being ignored
    router.replace('/dashboard');
  }, [router]);

  // Show a loading spinner while redirecting
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
