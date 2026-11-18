import { redirect } from 'next/navigation';
import { driverReturnPath,nativeDriverEnabled } from '@/lib/driver/mode';

export default async function DriverLogin({searchParams}:{searchParams:Promise<{next?:string}>}) {
  if (!nativeDriverEnabled) redirect('/login');
  redirect(driverReturnPath((await searchParams).next ?? null));
}
