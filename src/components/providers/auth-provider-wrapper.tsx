'use client';

import { AuthProvider } from '@/hooks/use-auth';

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
