export type RouteActionKind = 'start' | 'finish';
export type RouteActionProblem = { title: string; description: string };

const verbs: Record<RouteActionKind, string> = { start: 'iniciar', finish: 'finalizar' };

const byCode: Record<string, string> = {
  earnings_session_revalidating: 'Sua sessão está sendo verificada. Aguarde alguns segundos e toque de novo.',
  route_invalid_state: 'Esta rota mudou de situação. Atualize a tela para ver como ela está agora.',
  route_not_ready: 'O sistema ainda não tem 80% das entregas registradas. Atualize a tela e confira as paradas.',
  route_access_denied: 'Esta rota não está mais atribuída a você. Fale com a central.',
  route_not_found: 'Esta rota não está mais disponível para você. Fale com a central.',
};

/** Traduz a falha de "Iniciar"/"Finalizar" em uma mensagem que diz ao motorista o que fazer. */
export function routeActionProblem(action: RouteActionKind, error: unknown): RouteActionProblem {
  const verb = verbs[action];
  const title = `Não foi possível ${verb} a rota`;
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
  const message = typeof code === 'string' ? byCode[code] : undefined;
  if (message) return { title, description: message };
  if (status === 401) return { title, description: 'Sua sessão expirou. Entre novamente para continuar.' };
  if (status === 403) return { title, description: 'Sua conta não tem acesso a esta rota. Fale com a central.' };
  if (typeof status === 'number' && status >= 500) {
    return { title, description: 'O sistema está indisponível no momento. Tente de novo em instantes.' };
  }
  if (typeof status !== 'number') {
    return { title, description: 'Sem conexão com a internet. Verifique o sinal e tente de novo.' };
  }
  const suffix = typeof code === 'string' && code ? ` Código: ${code}` : '';
  return { title, description: `Não foi possível ${verb} a rota. Tente de novo ou fale com a central.${suffix}` };
}
