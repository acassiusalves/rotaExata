import { redirect } from 'next/navigation';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import LegacyChangePassword from './legacy-change-password';

export default function ChangePasswordPage() {
  if (nativeStaffEnabled) redirect("/driver/conta?next=%2Fdashboard");
  return <LegacyChangePassword />;
}
