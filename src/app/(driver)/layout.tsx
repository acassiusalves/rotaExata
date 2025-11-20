
'use client';
import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DriverNavigationDrawer } from '@/components/driver/driver-navigation-drawer';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, Bell, Home } from 'lucide-react';
import { NotificationPermissionPrompt } from '@/components/notifications/notification-permission-prompt';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userRole, loading, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  console.log('🚗 [DriverLayout] Renderizando. Loading:', loading, 'MustChangePassword:', mustChangePassword);

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

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };

  // Verificar se está na página inicial (Rotas Ativas)
  const isHomePage = pathname === '/my-routes';

  return (
    <div className="flex min-h-screen w-full flex-col">
      {/* Header do motorista com novo design */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:h-16 sm:px-6">
        <DriverNavigationDrawer />
        {!isHomePage && (
          <Button variant="ghost" size="icon" asChild>
            <Link href="/my-routes">
              <Home className="h-5 w-5" />
              <span className="sr-only">Voltar para página inicial</span>
            </Link>
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.photoURL ?? undefined} />
          <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback>
        </Avatar>
      </header>
      <main className="flex-1 bg-muted/40">
        <div className="mx-auto w-full max-w-md">
          {children}
        </div>
      </main>
      {/* Prompt de permissão de notificações */}
      {user && userRole && (
        <NotificationPermissionPrompt userId={user.uid} userRole={userRole} />
      )}
    </div>
  );
}
