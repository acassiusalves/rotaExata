'use client';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { FALLBACK_ORIGIN, isValidOrigin } from '@/lib/default-origin';
import type { PlaceValue } from '@/lib/types';

/**
 * Lê a origem padrão de settings/defaultOrigin.
 *
 * Versão imperativa, para chamar de dentro dos efeitos de carregamento que já são
 * async e rodam uma vez só. Um hook não serve nesses casos: as telas de acompanhar
 * carregam dados em efeitos de centenas de linhas com deps [serviceId, router, toast],
 * e acrescentar a origem às deps faria o carregador inteiro rodar de novo quando o
 * Firestore respondesse.
 *
 * Nunca lança e nunca devolve null — cai em FALLBACK_ORIGIN.
 */
export async function carregarOrigemPadrao(): Promise<PlaceValue> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'defaultOrigin'));
    const salva = snap.exists() ? (snap.data()?.origin as PlaceValue | undefined) : undefined;
    if (isValidOrigin(salva)) return salva!;
  } catch (erro) {
    console.warn('[carregarOrigemPadrao] falha ao ler settings/defaultOrigin, usando fallback:', erro);
  }
  return FALLBACK_ORIGIN;
}
