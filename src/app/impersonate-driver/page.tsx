import { redirect } from 'next/navigation';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import LegacyImpersonation from './legacy-impersonation';

export default function ImpersonateDriverPage() {
  if (nativeStaffEnabled || nativeDriverEnabled) redirect('/drivers');
  return <LegacyImpersonation />;
}
