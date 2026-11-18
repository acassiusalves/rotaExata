'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ConfirmProvider } from '@/hooks/use-confirm';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { ErrorBoundary } from '@/components/error-boundary';

const LegacyAuthShell = dynamic(() => import('./legacy-auth-shell').then(module => module.LegacyAuthShell), { ssr: false });

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const finance = pathname === '/financeiro' || pathname.startsWith('/financeiro/') || pathname === '/driver/earnings';
  const driver=nativeDriverEnabled && (pathname==='/' || pathname==='/login' || pathname==='/my-routes' || pathname.startsWith('/my-routes/') || pathname.startsWith('/driver/'));
  return <ErrorBoundary><ConfirmProvider>
    {finance||driver ? children : <LegacyAuthShell>{children}</LegacyAuthShell>}
  </ConfirmProvider></ErrorBoundary>;
}
