export type StaffPageResult<T>={items:T[];cursor:string|null};
type StaffPageRequest=<T>(url:string,init?:RequestInit)=>Promise<T>;

export async function collectStaffPages<T extends {id:string}>(
  load:(cursor?:string)=>Promise<StaffPageResult<T>>,
) {
  const records=new Map<string,T>();
  const visited=new Set<string>();
  let cursor:string|undefined;
  do {
    const page=await load(cursor);
    for (const record of page.items) records.set(record.id,record);
    if (page.cursor && visited.has(page.cursor)) throw new Error('A página não continuou. Recarregue a lista.');
    if (page.cursor) visited.add(page.cursor);
    cursor=page.cursor ?? undefined;
  } while(cursor);
  return [...records.values()];
}

export function staffPageUrl(path:string,cursor?:string) {
  return !cursor ? path : path+(path.includes('?') ? '&':'?')+'cursor='+encodeURIComponent(cursor);
}

export async function loadStaffPageList<T extends {id:string},K extends string>(
  request:StaffPageRequest,path:string,field:K,signal?:AbortSignal,
) {
  return collectStaffPages<T>(async cursor=>{
    const result=await request<Record<K,T[]> & {cursor:string|null}>(staffPageUrl(path,cursor),{signal});
    return {items:result[field],cursor:result.cursor};
  });
}

export function staffPollDelay(interval:number,failures:number) {
  return Math.min(60_000,interval*2**Math.min(failures,6));
}
