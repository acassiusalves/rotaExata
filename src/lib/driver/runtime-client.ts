export type DriverRequest = <T>(path:string,init?:RequestInit)=>Promise<T>;

export function driverQuery(endpoint:string,resource:string,query:Record<string,string>={}) {
  return endpoint+'?'+new URLSearchParams({resource,...query}).toString();
}
export function driverCommand<T>(request:DriverRequest,endpoint:string,payload:Record<string,unknown>,signal?:AbortSignal) {
  return request<T>(endpoint,{method:'POST',body:JSON.stringify(payload),signal});
}

export async function driverPages<T>(request:DriverRequest,endpoint:string,view:'active'|'history',signal?:AbortSignal) {
  let after:string|null=null;
  const seen=new Set<string>();
  const all:T[]=[];
  do {
    const page:{routes:T[];nextCursor:string|null}=await request(driverQuery(endpoint,'routes',{view,...(after ? {after}:{})}),{signal});
    all.push(...page.routes);
    after=page.nextCursor;
    if (after && seen.has(after)) throw new Error('Cursor de rotas repetido');
    if (after) seen.add(after);
  } while (after && !signal?.aborted);
  return all;
}
