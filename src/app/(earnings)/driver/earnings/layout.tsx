import type { ReactNode } from 'react';
import { EarningsShell } from '@/components/earnings/earnings-shell';

export default function DriverEarningsLayout({ children }: { children: ReactNode }) {
  return <EarningsShell driver>{children}</EarningsShell>;
}
