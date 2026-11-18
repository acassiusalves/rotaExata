import { notFound } from 'next/navigation';
import { DriverAccountAdmin } from '@/components/driver/driver-account-admin';
import { nativeDriverEnabled } from '@/lib/driver/mode';

export default function DriverAccountsPage() {
  if (!nativeDriverEnabled) notFound();
  return <DriverAccountAdmin />;
}
