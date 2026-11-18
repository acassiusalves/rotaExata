export class EarningsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function earningsSupabaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) throw new EarningsError(503, 'earnings_unavailable');
  const url = new URL(raw);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new EarningsError(503, 'earnings_unavailable');
  }
  return url.origin;
}

async function request(path: string, headers: Record<string, string>, body?: Record<string, unknown>, method = body ? 'POST' : 'GET') {
  try {
    return await fetch(earningsSupabaseUrl() + path, {
      method,
      headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new EarningsError(503, 'earnings_unavailable');
  }
}

export async function verifySupabaseUser(token: string) {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new EarningsError(503, 'earnings_unavailable');
  const response = await request('/auth/v1/user', { apikey: key, authorization: 'Bearer ' + token });
  if ([400, 401, 403].includes(response.status)) throw new EarningsError(401, 'earnings_unauthorized');
  if (!response.ok) throw new EarningsError(503, 'earnings_unavailable');
  return await response.json();
}

export async function updateSupabasePassword(token: string, userId: string, password: string) {
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new EarningsError(503,'earnings_unavailable');
  const response=await request('/auth/v1/user',{apikey:key,authorization:'Bearer '+token},{password},'PUT');
  if (!response.ok) {
    const payload=await response.json().catch(()=>null);
    const code=payload?.error_code ?? payload?.code;
    if (code==='reauthentication_needed') throw new EarningsError(422,'driver_password_reauthentication');
    if (code==='same_password') throw new EarningsError(422,'driver_password_unchanged');
    if (code==='weak_password') throw new EarningsError(422,'driver_password_weak');
    if ([401,403].includes(response.status)) throw new EarningsError(401,'earnings_unauthorized');
    if (response.status===429) throw new EarningsError(429,'driver_password_rate_limited');
    throw new EarningsError(503,'earnings_unavailable');
  }
  const user=await response.json().catch(()=>null);
  if (user?.id!==userId) throw new EarningsError(503,'earnings_unavailable');
}

export async function earningsRpc<Result = unknown>(name: string, params: Record<string, unknown>): Promise<Result> {
  const key = process.env.SUPABASE_EARNINGS_SECRET_KEY;
  if (!key || !/^[a-z][a-z_]+$/.test(name)) throw new EarningsError(503, 'earnings_unavailable');
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.authorization = 'Bearer ' + key;
  const response = await request('/rest/v1/rpc/' + name, headers, params);
  if (!response.ok) throw new EarningsError(503, 'earnings_unavailable');
  try {
    return await response.json() as Result;
  } catch {
    throw new EarningsError(503, 'earnings_unavailable');
  }
}

export function earningsErrorResponse(error: unknown) {
  if (error instanceof EarningsError) {
    return Response.json({ code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store, private', Vary: 'Authorization' } });
  }
  return Response.json({ code: 'earnings_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store, private', Vary: 'Authorization' } });
}

export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new EarningsError(413, 'earnings_request_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new EarningsError(400, 'earnings_invalid_request');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel();
        throw new EarningsError(413, 'earnings_request_too_large');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof EarningsError) throw error;
    throw new EarningsError(400, 'earnings_invalid_request');
  } finally {
    reader.releaseLock();
  }
}
