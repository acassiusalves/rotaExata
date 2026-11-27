export class EarningsRequestError extends Error {
  readonly status:number;
  readonly code:string;
  readonly issues:{code:string;stopId?:string}[];

  constructor(status:number,code:string,issues:{code:string;stopId?:string}[]=[]) {
    super(code);
    this.status=status;
    this.code=code;
    this.issues=issues;
  }
}

type SessionRequest = {
  token:()=>Promise<string|undefined>;
  authorizeWrite:(token:string)=>boolean;
  isCurrent:()=>boolean;
  sessionSignal:AbortSignal;
  fetch?:typeof fetch;
};

export async function nativeSessionRequest<T>(path:string,init:RequestInit|undefined,session:SessionRequest):Promise<T> {
  const origin='https://rota-exata.invalid';
  if (!path.startsWith('/api/') || /[\\\r\n]/.test(path) ||
      !new URL(path,origin).pathname.startsWith('/api/')) throw new EarningsRequestError(400,'earnings_invalid_path');

  function assertCurrent() {
    if (session.sessionSignal.aborted || !session.isCurrent()) throw new EarningsRequestError(401,'earnings_unauthorized');
  }

  assertCurrent();
  const token=await session.token();
  assertCurrent();
  if (!token) throw new EarningsRequestError(401,'earnings_unauthorized');
  const method=init?.method?.toUpperCase() ?? 'GET';
  if (method!=='GET' && !session.authorizeWrite(token)) throw new EarningsRequestError(409,'earnings_session_revalidating');

  const headers=new Headers(init?.headers);
  headers.set('Authorization','Bearer '+token);
  if (typeof init?.body==='string' && !headers.has('content-type')) headers.set('Content-Type','application/json');
  const signal=init?.signal ? AbortSignal.any([init.signal,session.sessionSignal]) : session.sessionSignal;
  try {
    const response=await (session.fetch ?? fetch)(path,{...init,headers,signal,cache:'no-store',redirect:'error'});
    const body=await response.json().catch(()=>null);
    assertCurrent();
    signal.throwIfAborted();
    if (!response.ok || !body) throw new EarningsRequestError(response.status,body?.code ?? body?.error,body?.issues);
    return body as T;
  } catch (err) {
    assertCurrent();
    throw err;
  }
}
