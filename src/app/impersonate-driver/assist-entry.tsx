'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { writeAssistGrant } from '@/lib/driver/assist-session';

/** Guarda o acesso nesta aba e abre o app do motorista. */
export function AssistEntry({ grant }: { grant: string }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    // Navegador que bloqueia o armazenamento da aba não consegue guardar o acesso: avisa em vez de abrir o app sem ele.
    try { writeAssistGrant(grant); }
    catch { setBlocked(true); return; }
    router.replace('/my-routes');
  }, [grant, router]);
  if (blocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center" role="alert">
        <p className="font-semibold">Não foi possível abrir o app do motorista</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          O navegador bloqueou o armazenamento desta aba. Libere cookies e dados do site para o RotaExata e abra de novo pelo painel.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40" role="status">
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
      <p className="text-muted-foreground">Abrindo o app do motorista…</p>
    </div>
  );
}
