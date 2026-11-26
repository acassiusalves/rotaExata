type ProfileRequest = (path: string) => Promise<unknown>;

/**
 * Para onde levar uma conta que o painel recusou (403).
 * Se a mesma sessão abre o perfil do app do motorista, a conta é de motorista e vai para as rotas dela.
 * Qualquer outra resposta, ou falha ao conferir, mantém a tela de recusa do painel.
 */
export async function deniedStaffDestination(request: ProfileRequest, status: number, code?: string): Promise<string | null> {
  if (status !== 403 || code === 'platform_password_change_required') return null;
  try {
    await request('/api/driver/runtime?resource=profile');
    return '/my-routes';
  } catch {
    return null;
  }
}
