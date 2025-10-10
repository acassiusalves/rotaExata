
'use client';
import { MainLayout } from '@/components/layout/main-layout';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userRole, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (userRole && !['admin', 'socio', 'gestor'].includes(userRole)) {
        // Se não é admin/socio/gestor, redireciona para área do motorista
        router.push('/my-routes');
      }
    }
  }, [user, userRole, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Renderiza nulo enquanto redireciona para evitar piscar o layout errado
  if (!user || (userRole && !['admin', 'socio', 'gestor'].includes(userRole))) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  return <MainLayout>{children}</MainLayout>;
}
