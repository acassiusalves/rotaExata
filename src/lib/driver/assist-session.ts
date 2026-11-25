import { isAssistGrantId } from './assist-policy.ts';

export const ASSIST_STORAGE_KEY = 'rotaDriverAssist';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// sessionStorage é por aba: as outras abas do painel continuam fora do modo operador.
// O próprio acesso a `window.sessionStorage` pode lançar quando o navegador bloqueia o armazenamento.
function tabStorage(): Store | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

/** Todo motorista passa por aqui ao abrir o app: armazenamento bloqueado significa "sem acesso", nunca erro. */
export function readAssistGrant(storage: Store | null = tabStorage()) {
  try {
    const value = storage?.getItem(ASSIST_STORAGE_KEY) ?? null;
    if (value === null) return null;
    if (isAssistGrantId(value)) return value;
    storage?.removeItem(ASSIST_STORAGE_KEY);
    return null;
  } catch { return null; }
}

/** Ao contrário da leitura, gravar precisa avisar: sem armazenamento a aba não entra no modo operador. */
export function writeAssistGrant(grantId: string, storage: Store | null = tabStorage()) {
  if (!isAssistGrantId(grantId)) throw new Error('Acesso inválido.');
  if (!storage) throw new Error('Armazenamento da aba indisponível.');
  storage.setItem(ASSIST_STORAGE_KEY, grantId);
}

export function clearAssistGrant(storage: Store | null = tabStorage()) {
  try { storage?.removeItem(ASSIST_STORAGE_KEY); } catch { /* sem armazenamento não há o que apagar */ }
}

export const assistEntryPath = (grantId: string) => '/impersonate-driver?grant=' + encodeURIComponent(grantId);
