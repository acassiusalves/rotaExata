'use client';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function Page() {
  const { userRole, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (userRole === 'admin' || userRole === 'seller' || userRole === 'vendedor') {
      router.replace('/dashboard');
    } else if (userRole === 'driver') {
      router.replace('/my-routes');
    } else {
      router.replace('/login');
    }
  }, [userRole, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
