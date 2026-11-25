'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { writeAssistGrant } from '@/lib/driver/assist-session';

/** Guarda o acesso nesta aba e abre o app do motorista. */
export function AssistEntry({ grant }: { grant: string }) {
  const router = useRouter();
  useEffect(() => {
    writeAssistGrant(grant);
    router.replace('/my-routes');
  }, [grant, router]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40" role="status">
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
      <p className="text-muted-foreground">Abrindo o app do motorista…</p>
    </div>
  );
}
