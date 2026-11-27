import { nativeStaffEnabled } from '@/lib/staff/mode';
import { staffReturnPath } from '@/lib/staff/access';
import { RotaLogin } from '@/components/staff/staff-session';
import { redirect } from 'next/navigation';
import LegacyLogin from '@/components/auth/legacy-login';
import { LegacyAuthShell } from '@/components/providers/legacy-auth-shell';
import { driverReturnPath,nativeDriverEnabled } from '@/lib/driver/mode';

export default async function LoginPage({searchParams}:{searchParams:Promise<{admin?:string;next?:string}>}) {
  const selection=await searchParams;
  if (nativeStaffEnabled) return <RotaLogin next={staffReturnPath(selection.next)} staffOnly={selection.admin==='1'} driverNext={driverReturnPath(selection.next)} />;
  if (nativeDriverEnabled && selection.admin!=='1') redirect(driverReturnPath(selection.next ?? null));
  return nativeDriverEnabled ? <LegacyAuthShell><LegacyLogin /></LegacyAuthShell> : <LegacyLogin />;
}
