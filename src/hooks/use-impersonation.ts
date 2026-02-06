'use client';

import { useState, useEffect } from 'react';

/**
 * Hook para detectar se o usuário está em modo de impersonação (teste como motorista)
 * Verifica a flag 'isImpersonating' no localStorage
 */
export function useIsImpersonating(): boolean {
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    // Ler do localStorage
    const checkImpersonation = () => {
      if (typeof window !== 'undefined') {
        const flag = localStorage.getItem('isImpersonating');
        setIsImpersonating(flag === 'true');
      }
    };

    checkImpersonation();

    // Adicionar listener para mudanças no localStorage (caso outra aba modifique)
    window.addEventListener('storage', checkImpersonation);

    return () => {
      window.removeEventListener('storage', checkImpersonation);
    };
  }, []);

  return isImpersonating;
}

/**
 * Sai do modo de impersonação
 * Remove a flag do localStorage e fecha a aba/janela
 */
export function exitImpersonationMode(): void {
  if (typeof window !== 'undefined') {
    // Remover flag do localStorage
    localStorage.removeItem('isImpersonating');
    localStorage.removeItem('impersonatedDriverName');

    // Fechar a aba/janela
    window.close();

    // Se window.close() não funcionar (algumas situações não permitem),
    // redirecionar para página de login
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
  if (typeof window !== 'undefined') {
    return localStorage.getItem('impersonatedDriverName');
  }
  return null;
}
