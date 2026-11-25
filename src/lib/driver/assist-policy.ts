export const ASSIST_TTL_MS = 60 * 60 * 1000;
export const ASSIST_HEADER = 'x-rota-assist';

/** Quem está operando em nome do motorista. Vai junto de cada comando de rota. */
export type RouteAssist = { grantId: string; staffUserId: string; staffSourceUid: string; staffName: string };

export type AssistGrantFacts = { staffUserId: string; staffSessionId: string; expiresAtMs: number; endedAtMs: number | null };
export type AssistProblem = 'assist_not_found' | 'assist_expired';

/** O acesso só vale para o operador e a sessão que o abriram, até vencer ou ser encerrado. */
export function assistGrantProblem(
  grant: AssistGrantFacts | undefined, actor: { userId: string; sessionId: string }, now: number,
): AssistProblem | null {
  if (!grant || grant.staffUserId !== actor.userId || grant.staffSessionId !== actor.sessionId) return 'assist_not_found';
  return grant.endedAtMs !== null || now >= grant.expiresAtMs ? 'assist_expired' : null;
}

/** O operador age na rota; não fala pelo aparelho do motorista (localização, presença, push, preferências). */
export function assistCommandAllowed(kind: unknown) {
  return kind === 'route' || kind === 'upload';
}

export function isAssistGrantId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function assistOpenMessage(error: unknown) {
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
  if (code === 'staff_driver_not_found') return 'Motorista não encontrado.';
  if (code === 'staff_invalid_command') return 'Informe o motivo com pelo menos 5 caracteres.';
  if (status === 403) return 'Sua conta não tem acesso a esta função.';
  return 'Não foi possível abrir o app do motorista. Tente de novo.';
}
