'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLayoutIdentity } from '@/components/staff/staff-session';

export default function ReportsPage() {
  const router=useRouter();
  const {canNavigate}=useLayoutIdentity();
  const destination=canNavigate('/reports/general') ? '/reports/general' :
    canNavigate('/reports/numbers') ? '/reports/numbers':null;
  useEffect(()=>{if (destination) router.replace(destination);},[destination,router]);
  return destination ? <p role="status">Abrindo relatório…</p> : <p role="alert">Sua conta não tem acesso aos relatórios.</p>;
}
