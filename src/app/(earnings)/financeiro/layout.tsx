import type { ReactNode } from 'react';
import { EarningsShell } from '@/components/earnings/earnings-shell';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <EarningsShell>{children}</EarningsShell>;
}
