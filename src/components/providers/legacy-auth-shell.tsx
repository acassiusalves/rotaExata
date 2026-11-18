'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/hooks/use-auth';
import { FloatingFeedbackButton } from '@/components/FloatingFeedbackButton';

export function LegacyAuthShell({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}<FloatingFeedbackButton /></AuthProvider>;
}
