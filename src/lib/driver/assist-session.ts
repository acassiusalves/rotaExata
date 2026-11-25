import { isAssistGrantId } from './assist-policy.ts';

export const ASSIST_STORAGE_KEY = 'rotaDriverAssist';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// sessionStorage é por aba: as outras abas do painel continuam fora do modo operador.
const tabStorage = (): Store | null => (typeof window === 'undefined' ? null : window.sessionStorage);

export function readAssistGrant(storage: Store | null = tabStorage()) {
  const value = storage?.getItem(ASSIST_STORAGE_KEY) ?? null;
  if (value === null) return null;
  if (isAssistGrantId(value)) return value;
  storage?.removeItem(ASSIST_STORAGE_KEY);
  return null;
}

export function writeAssistGrant(grantId: string, storage: Store | null = tabStorage()) {
  if (!isAssistGrantId(grantId)) throw new Error('Acesso inválido.');
  storage?.setItem(ASSIST_STORAGE_KEY, grantId);
}

export function clearAssistGrant(storage: Store | null = tabStorage()) {
  storage?.removeItem(ASSIST_STORAGE_KEY);
}

export const assistEntryPath = (grantId: string) => '/impersonate-driver?grant=' + encodeURIComponent(grantId);
