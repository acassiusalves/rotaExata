import {createHash} from 'node:crypto';
import {type DocumentSnapshot,Timestamp} from 'firebase-admin/firestore';
import {z} from 'zod';
import {EarningsError} from '../earnings/transport';

export const supportCursor=z.object({
  id:z.string().min(1).max(1500).refine(id=>!id.includes('/')),
  timestamp:z.union([z.tuple([z.number().int().min(-62135596800).max(253402300799),z.number().int().min(0).max(999999999)]),z.string().max(100),z.number()]),
}).strict();
export type SupportCursor=z.infer<typeof supportCursor>;

export function cursorFor(doc:DocumentSnapshot,field:string):SupportCursor {
  const value=doc.get(field);
  return {id:doc.id,timestamp:value instanceof Timestamp ? [value.seconds,value.nanoseconds]:value};
}
export function cursorTimestamp(cursor:SupportCursor) {
  return Array.isArray(cursor.timestamp) ? new Timestamp(...cursor.timestamp):cursor.timestamp;
}
export function revisionOf(doc:DocumentSnapshot) {
  const time=doc.updateTime;
  return time ? time.seconds+'.'+time.nanoseconds:'';
}
export function supportHash(parts:unknown) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export function readSupportCursor<T>(raw:string|undefined,schema:z.ZodType<T>):T|undefined {
  if (raw===undefined) return;
  try { return schema.parse(JSON.parse(raw)); }
  catch { throw new EarningsError(422,'staff_invalid_cursor'); }
}
