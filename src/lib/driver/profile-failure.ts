export type ProfileFailure =
  | { kind: 'stale' }
  | { kind: 'denied'; message: string; passwordRequired: boolean; signOut: boolean; retry: boolean };

/**
 * O que fazer quando a leitura do perfil falha.
 * `stale`: falha passageira; mantém a tela e bloqueia gravações até revalidar.
 * `denied`: recusa de acesso (401/403). No modo operador a sessão é a do painel, compartilhada
 * com as outras abas: nunca é encerrada daqui.
 */
export function profileFailure(failure: unknown, mode: { native: boolean; assist: boolean }): ProfileFailure {
  const { status, code } = (failure ?? {}) as { status?: unknown; code?: unknown };
  if (status !== 401 && status !== 403) return { kind: 'stale' };
  if (mode.assist) {
    if (code === 'assist_expired' || code === 'assist_not_found') {
      return { kind: 'denied', message: 'Acesso encerrado. Abra de novo pelo painel.', passwordRequired: false, signOut: false, retry: false };
    }
    if (status === 401) {
      return { kind: 'denied', message: 'Sua sessão do painel expirou. Entre de novo no painel e abra o app do motorista outra vez.',
        passwordRequired: false, signOut: false, retry: false };
    }
    return { kind: 'denied', message: 'Sua conta não tem acesso a esta função.', passwordRequired: false, signOut: false, retry: true };
  }
  return {
    kind: 'denied',
    message: status === 403 ? 'Esta conta não tem acesso às rotas.' : 'Não foi possível carregar sua conta.',
    passwordRequired: mode.native && code === 'platform_password_change_required',
    signOut: status === 401,
    retry: true,
  };
}
