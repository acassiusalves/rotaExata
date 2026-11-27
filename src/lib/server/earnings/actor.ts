import { z } from 'zod';
import { EarningsError, earningsRpc, earningsSupabaseUrl, verifySupabaseUser } from './transport.ts';

const uuid = z.string().uuid();
const claimsSchema = z.object({
  sub: uuid,
  session_id: uuid,
  iss: z.string(),
  exp: z.number().int(),
  aud: z.union([z.string(), z.array(z.string())]),
  role: z.literal('authenticated'),
  aal: z.enum(['aal1', 'aal2']),
});
const actorSchema = z.object({
  userId: uuid,
  sessionId: uuid,
  scopeId: uuid,
  revision: z.number().int().nonnegative().safe(),
  policyRevision: z.number().int().nonnegative().safe(),
  sourceUid: z.string().min(1).max(128).optional(),
  sourceKind:z.enum(['firebase','native']).optional(),
  role: z.enum(['admin', 'socio', 'gestor', 'driver']),
  application: z.enum(['lunna', 'driver']),
});
export type EarningsActor = z.infer<typeof actorSchema>;
const actions = {
  statement: ['driver'],
  'route:operate': ['driver'],
  'rule:read': ['admin', 'socio'],
  'rule:publish': ['admin', 'socio'],
  'payment:read': ['admin', 'socio', 'gestor'],
  'payment:write': ['admin', 'socio', 'gestor'],
} as const satisfies Record<string, readonly EarningsActor['role'][]>;
export type EarningsAction = keyof typeof actions;
export type ActorAuthority = {
  issuer: string;
  scopeId: string;
  now?: () => number;
  verify: (token: string) => Promise<{ id: string; is_anonymous?: boolean; factors?: { status: string }[] }>;
  resolve: (input: { userId: string; sessionId: string; scopeId: string; application: EarningsActor['application']; action: EarningsAction }) => Promise<unknown>;
};

function defaultAuthority(): ActorAuthority {
  return {
    issuer: earningsSupabaseUrl() + '/auth/v1',
    scopeId: earningsScopeId(),
    verify: verifySupabaseUser,
    resolve: ({ userId, sessionId, scopeId, application, action }) => earningsRpc('rota_earnings_resolve_actor', {
      p_user_id: userId, p_session_id: sessionId, p_scope_id: scopeId, p_application: application, p_action: action,
    }),
  };
}

export async function verifyNativeSession(request: Request, authority?: Pick<ActorAuthority,'issuer'|'now'|'verify'>) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 16384) throw new EarningsError(401, 'earnings_unauthorized');
  const auth:Pick<ActorAuthority,'issuer'|'now'|'verify'> = authority ?? { issuer: earningsSupabaseUrl() + '/auth/v1', verify: verifySupabaseUser };
  const user = await auth.verify(token);
  let claims: z.infer<typeof claimsSchema>;
  let delegated: boolean;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('invalid token structure');
    const raw = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    claims = claimsSchema.parse(raw);
    delegated = Object.hasOwn(raw, 'client_id');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (user.is_anonymous || user.id !== claims.sub || claims.iss !== auth.issuer ||
        !aud.includes('authenticated') || claims.exp * 1000 <= (auth.now ?? Date.now)()) {
      throw new Error('invalid session');
    }
  } catch {
    throw new EarningsError(401, 'earnings_unauthorized');
  }
  if (delegated || request.headers.has('x-impersonate-user') ||
      (user.factors?.some(factor => factor.status === 'verified') && claims.aal !== 'aal2')) {
    throw new EarningsError(403, 'earnings_access_denied');
  }

  return { userId: claims.sub, sessionId: claims.session_id, token };
}

export function earningsScopeId() {
  const scopeId=uuid.safeParse(process.env.ROTA_EARNINGS_SCOPE_ID);
  if (!scopeId.success) throw new EarningsError(503,'earnings_unavailable');
  return scopeId.data;
}

export async function requireEarningsActor(request: Request, action: EarningsAction, authority?: ActorAuthority): Promise<EarningsActor> {
  const identity=await verifyNativeSession(request,authority);
  return resolveEarningsActor(identity,action,authority);
}

export async function resolveEarningsActor(
  identity:Awaited<ReturnType<typeof verifyNativeSession>>,action:EarningsAction,auth:ActorAuthority=defaultAuthority(),
):Promise<EarningsActor> {
  const application = action === 'statement' || action === 'route:operate' ? 'driver' : 'lunna';
  const result = await auth.resolve({
    userId: identity.userId, sessionId: identity.sessionId, scopeId: auth.scopeId, application, action,
  });
  const code = (result as { errorCode?: unknown } | null)?.errorCode;
  if (code === 'platform_session_revoked') throw new EarningsError(401, 'earnings_unauthorized');
  if (code === 'platform_directory_unavailable') throw new EarningsError(503, 'earnings_unavailable');
  if (code === 'platform_password_change_required' && action === 'route:operate') throw new EarningsError(403,code);
  if (code) throw new EarningsError(403, 'earnings_access_denied');
  const parsed = actorSchema.safeParse(result);
  if (!parsed.success) throw new EarningsError(503, 'earnings_unavailable');
  const actor = parsed.data;
  const allowedRoles: readonly string[] = actions[action];
  if (actor.userId !== identity.userId || actor.sessionId !== identity.sessionId || actor.scopeId !== auth.scopeId ||
      actor.application !== application || !allowedRoles.includes(actor.role) || (action === 'route:operate' && !actor.sourceUid)) {
    throw new EarningsError(403, 'earnings_access_denied');
  }
  return actor;
}
