import { FieldPath,Timestamp,type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { routeDocumentId } from '../../staff/route-contract.ts';
import { EarningsError } from '../earnings/transport.ts';

const cursorSchema=z.object({
  id:routeDocumentId,
  sort:z.union([z.tuple([z.number().int(),z.number().int().min(0).max(999999999)]),z.string(),z.number(),z.null()]).optional(),
}).strict();
export const staffCursorInput=z.string().min(1).max(1200).regex(/^[A-Za-z0-9_-]+$/);

export function readStaffCursor(request:Request) {
  const value=new URL(request.url).searchParams.get('cursor');
  const parsed=staffCursorInput.optional().safeParse(value ?? undefined);
  if (!parsed.success) throw new EarningsError(422,'staff_invalid_cursor');
  return parsed.data;
}

export async function staffQueryPage(query:Query,cursor?:string,options:{
  field?:string;direction?:'asc'|'desc';size?:number;
}={}) {
  const {field,direction='asc',size=24}=options;
  let ordered=field ? query.orderBy(field,direction).orderBy(FieldPath.documentId(),direction):
    query.orderBy(FieldPath.documentId(),direction);
  if (cursor) {
    let decoded:unknown;
    try {decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());}
    catch {throw new EarningsError(422,'staff_invalid_cursor');}
    const parsed=cursorSchema.safeParse(decoded);
    if (!parsed.success || (parsed.data.sort!==undefined)!==!!field) throw new EarningsError(422,'staff_invalid_cursor');
    const {sort,id}=parsed.data;
    ordered=field ? ordered.startAfter(Array.isArray(sort) ? new Timestamp(...sort):sort,id):ordered.startAfter(id);
  }
  const result=await ordered.limit(size+1).get();
  const docs=result.docs.slice(0,size);
  const last=docs.at(-1);
  const sort=last && field ? last.get(field):undefined;
  return {docs,cursor:result.size>size && last ? Buffer.from(JSON.stringify({
    id:last.id,...(field ? {sort:sort instanceof Timestamp ? [sort.seconds,sort.nanoseconds]:sort ?? null}:{}),
  })).toString('base64url'):null};
}
