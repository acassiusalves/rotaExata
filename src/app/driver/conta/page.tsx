import { notFound } from 'next/navigation';
import { DriverAccountEntry } from '@/components/driver/driver-account-entry';
import { nativeDriverEnabled,accountReturnPath } from '@/lib/driver/mode';

export default async function DriverAccountPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  if (!nativeDriverEnabled && process.env.NEXT_PUBLIC_ROTA_EARNINGS_ENABLED!=='true') notFound();
  return <DriverAccountEntry next={accountReturnPath((await searchParams).next)} />;
}
