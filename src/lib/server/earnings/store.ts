import type { EarningsActor } from './actor.ts';
import { EarningsError, earningsRpc } from './transport.ts';

export function actorParams(actor: EarningsActor) {
  return { p_user_id: actor.userId, p_session_id: actor.sessionId, p_scope_id: actor.scopeId };
}

export async function actorRpc<T>(actor: EarningsActor, rpc: string, body: Record<string, unknown> = {}): Promise<T> {
  const result = await earningsRpc<T & { errorCode?: string }>(rpc, { ...body, ...actorParams(actor) });
  const code = result?.errorCode;
  if (!code) return result;
  if (code === 'platform_session_revoked') throw new EarningsError(401, 'earnings_unauthorized');
  if (code === 'platform_directory_unavailable') throw new EarningsError(503, 'earnings_unavailable');
  if (code.startsWith('platform_')) throw new EarningsError(403, 'earnings_access_denied');
  if (code.endsWith('_not_found')) throw new EarningsError(404, code);
  if (code.endsWith('_conflict') || code === 'earnings_requires_review' || code === 'earnings_invalid_transition') throw new EarningsError(409, code);
  if (code.endsWith('_paused')) throw new EarningsError(503, code);
  if (code.startsWith('earnings_invalid_')) throw new EarningsError(422, code);
  throw new EarningsError(503, 'earnings_unavailable');
}

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private', Vary: 'Authorization' } });
}
