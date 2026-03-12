'use client';

import { useVersionCheck } from '@/hooks/use-version-check';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

export function UpdateAvailableBanner() {
  const { hasNewVersion, forceRefresh, dismiss } = useVersionCheck();

  if (!hasNewVersion) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-in slide-in-from-top fade-in duration-300">
      <div className="flex items-center justify-center gap-3 bg-red-600 text-white px-4 py-3 shadow-lg">
        <RefreshCw className="h-5 w-5 flex-shrink-0 animate-spin-slow" />
        <p className="text-sm font-semibold">
          Uma nova versão está disponível. Atualize para continuar usando o sistema corretamente.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={forceRefresh}
          className="font-bold bg-white text-red-600 hover:bg-red-50"
        >
          Atualizar agora
        </Button>
        <button
          onClick={dismiss}
          className="ml-1 p-1 rounded-md hover:bg-red-700 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
