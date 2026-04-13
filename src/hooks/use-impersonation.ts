'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import {
  clearImpersonationSession,
  enableImpersonationSession,
  getImpersonatedDriverNameFromSession,
  isImpersonationSessionActive,
} from '@/lib/impersonation-session';

/**
 * Hook para detectar se o usuário está em modo de impersonação (teste como motorista)
 * Verifica a sessão de impersonação apenas na aba atual
 */
export function useIsImpersonating(): boolean {
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    setIsImpersonating(isImpersonationSessionActive());
  }, []);

  return isImpersonating;
}

/**
 * Ativa a sessão local de impersonação
 */
export function startImpersonationMode(driverName?: string | null): void {
  enableImpersonationSession(driverName);
}

/**
 * Sai do modo de impersonação.
 * Remove a sessão local, encerra a autenticação isolada e fecha a aba/janela.
 */
export async function exitImpersonationMode(): Promise<void> {
  if (typeof window !== 'undefined') {
    clearImpersonationSession();

    try {
      await signOut(auth);
    } catch {
      // Ignora falha de logout local durante o encerramento do modo teste
    }

    window.close();

    setTimeout(() => {
      if (!window.closed) {
        window.location.href = '/login';
      }
    }, 100);
  }
}

/**
 * Retorna o nome do motorista sendo impersonado (se houver)
 */
export function getImpersonatedDriverName(): string | null {
  return getImpersonatedDriverNameFromSession();
}
