import { redirect } from 'next/navigation';
import { isAssistGrantId } from '@/lib/driver/assist-policy';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { AssistEntry } from './assist-entry';
import LegacyImpersonation from './legacy-impersonation';

export default async function ImpersonateDriverPage({ searchParams }: { searchParams: Promise<{ grant?: string | string[] }> }) {
  if (nativeStaffEnabled || nativeDriverEnabled) {
    const { grant } = await searchParams;
    // No modo nativo a única entrada é o acesso aberto pelo painel.
    if (nativeStaffEnabled && isAssistGrantId(grant)) return <AssistEntry grant={grant} />;
    redirect('/drivers');
  }
  return <LegacyImpersonation />;
}
