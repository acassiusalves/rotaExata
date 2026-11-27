import { nativeStaffEnabled } from '@/lib/staff/mode';
import { redirect } from 'next/navigation';
import LegacyHome from '@/components/auth/legacy-home';
import { nativeDriverEnabled } from '@/lib/driver/mode';

export default function Page() {
  if (nativeStaffEnabled) redirect('/login');
  if (nativeDriverEnabled) redirect('/my-routes');
  return <LegacyHome />;
}
