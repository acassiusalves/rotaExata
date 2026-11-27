import { z } from 'zod';
import { routeDocumentId,staffPlannedPlaceSchema,staffWriteFields } from './route-contract.ts';

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10)===value;
});

export const staffEditorReadSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('route'),id:routeDocumentId}).strict(),
  z.object({kind:z.literal('service'),id:routeDocumentId}).strict(),
  z.object({kind:z.literal('service-routes'),id:routeDocumentId}).strict(),
  z.object({kind:z.literal('scheduled'),date:day}).strict(),
  z.object({kind:z.literal('active')}).strict(),
  z.object({kind:z.literal('drivers')}).strict(),
  z.object({kind:z.literal('orders'),numbers:z.array(z.string().trim().min(1).max(150)).min(1).max(30)}).strict(),
  z.object({kind:z.literal('origin')}).strict(),
]);

export type StaffEditorRead=z.infer<typeof staffEditorReadSchema>;

const metrics=z.object({
  distanceMeters:z.number().min(0).max(10_000_000),
  duration:z.string().regex(/^\d+(?:\.\d+)?s$/),
  encodedPolyline:z.string().max(120_000),
  color:z.string().regex(/^#[a-f0-9]{3,8}$/i).optional(),
}).strict();
const key=z.string().regex(/^[A-Z]{1,3}$/);
export const staffManualStopSchema=staffPlannedPlaceSchema.omit({id:true,orderNumber:true}).strict();
const place=staffPlannedPlaceSchema.extend({pointCode:z.string().max(150).optional()}).strict();
export const staffArrangementSchema=z.object({
  key,name:z.string().trim().min(1).max(150),stops:z.array(place).min(1).max(400),info:metrics,
}).strict();

export const staffEditorCommandSchema=z.discriminatedUnion('kind',[
  z.object({...staffWriteFields,kind:z.literal('arrange'),routeId:routeDocumentId,
    routes:z.array(staffArrangementSchema).max(40),unassignedStops:z.array(place).max(400).optional()}).strict(),
  z.object({...staffWriteFields,kind:z.literal('add-manual-stop'),routeId:routeDocumentId,stop:staffManualStopSchema}).strict(),
  z.object({...staffWriteFields,kind:z.literal('route-pool'),routeId:routeDocumentId,stops:z.array(place).max(400)}).strict(),
  z.object({...staffWriteFields,kind:z.literal('delete-draft'),routeId:routeDocumentId}).strict(),
]);
export type StaffEditorCommand=z.infer<typeof staffEditorCommandSchema>;
