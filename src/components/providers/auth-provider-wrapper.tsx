'use client';

import { AuthProvider } from '@/hooks/use-auth';
import { ConfirmProvider } from '@/hooks/use-confirm';
import { ErrorBoundary } from '@/components/error-boundary';

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
