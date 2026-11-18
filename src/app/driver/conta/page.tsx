import { notFound } from 'next/navigation';
import { DriverAccountEntry } from '@/components/driver/driver-account-entry';
import { nativeDriverEnabled } from '@/lib/driver/mode';

export default function DriverAccountPage() {
  if (!nativeDriverEnabled) notFound();
  return <DriverAccountEntry />;
}
