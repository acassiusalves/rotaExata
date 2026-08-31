'use client';

import * as React from 'react';
import { carregarOrigemPadrao } from '@/lib/default-origin-client';
import { FALLBACK_ORIGIN } from '@/lib/default-origin';
import type { PlaceValue } from '@/lib/types';

/**
 * Origem padrão do sistema, para telas que precisam dela em estado de render.
 *
 * Começa em FALLBACK_ORIGIN e troca pela de settings/defaultOrigin quando chega.
 * Nunca devolve null — quem chama sempre tem uma origem utilizável.
 */
export function useDefaultOrigin(): { origin: PlaceValue; loading: boolean } {
  const [origin, setOrigin] = React.useState<PlaceValue>(FALLBACK_ORIGIN);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let ativo = true;
    carregarOrigemPadrao().then((o) => {
      if (!ativo) return;
      setOrigin(o);
      setLoading(false);
    });
    return () => { ativo = false; };
  }, []);

  return { origin, loading };
}
