import { notFound } from 'next/navigation';
import { DriverAccountEntry } from '@/components/driver/driver-account-entry';
import { nativeDriverEnabled,accountReturnPath } from '@/lib/driver/mode';

export default async function DriverAccountPage({searchParams}:{searchParams:Promise<{next?:string;primeiro?:string}>}) {
  if (!nativeDriverEnabled && process.env.NEXT_PUBLIC_ROTA_EARNINGS_ENABLED!=='true') notFound();
  const params=await searchParams;
  return <DriverAccountEntry next={accountReturnPath(params.next)} firstAccess={nativeDriverEnabled && params.primeiro==='1'} />;
}
