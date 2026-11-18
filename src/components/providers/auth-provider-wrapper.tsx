'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ConfirmProvider } from '@/hooks/use-confirm';
import { ErrorBoundary } from '@/components/error-boundary';

const LegacyAuthShell = dynamic(() => import('./legacy-auth-shell').then(module => module.LegacyAuthShell), { ssr: false });

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const finance = pathname === '/financeiro' || pathname.startsWith('/financeiro/') || pathname === '/driver/earnings';
  return <ErrorBoundary><ConfirmProvider>
    {finance ? children : <LegacyAuthShell>{children}</LegacyAuthShell>}
  </ConfirmProvider></ErrorBoundary>;
}
