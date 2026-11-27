import type { ReactNode } from 'react';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { MainLayout } from '@/components/layout/main-layout';
import { StaffGate } from '@/components/staff/staff-session';
import { EarningsShell } from '@/components/earnings/earnings-shell';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  if (nativeStaffEnabled && process.env.NEXT_PUBLIC_ROTA_EARNINGS_ENABLED==='true') return <EarningsShell portal staffLogin>
    <StaffGate><MainLayout>{children}</MainLayout></StaffGate>
  </EarningsShell>;
  return <EarningsShell>{children}</EarningsShell>;
}
