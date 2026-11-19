import { z } from 'zod';

export const routeDocumentId=z.string().trim().min(1).max(150).refine(id=>id!=='.' && id!=='..' && !/[\/\u0000-\u001f]/.test(id));
export const routeRevisionSchema=z.string().regex(/^\d{12}\.\d{9}$/);
export const staffWriteFields={ revision:routeRevisionSchema, commandId:z.string().uuid() };
export const staffRouteCommandSchema=z.discriminatedUnion('kind',[
  z.object({...staffWriteFields,kind:z.literal('rename'),name:z.string().trim().min(1).max(150)}).strict(),
  z.object({...staffWriteFields,kind:z.literal('assign'),driverId:routeDocumentId}).strict(),
  z.object({...staffWriteFields,kind:z.literal('duplicate')}).strict(),
  z.object({...staffWriteFields,kind:z.literal('delete')}).strict(),
  z.object({...staffWriteFields,kind:z.literal('complete')}).strict(),
]);
export type StaffRouteCommand=z.infer<typeof staffRouteCommandSchema>;

export const staffServiceCloseSchema=z.object({...staffWriteFields,kind:z.literal('force-complete')}).strict();

const shortText=z.string().max(500).optional();
const addressParts=z.object({
  street:shortText,number:shortText,neighborhood:shortText,city:shortText,state:shortText,zipCode:shortText,
  rua:shortText,numero:shortText,bairro:shortText,cidade:shortText,uf:shortText,cep:shortText,
});
export const staffPlannedPlaceSchema=z.object({
  id:routeDocumentId,
  placeId:z.string().max(500),
  address:z.string().trim().max(1500),
  lat:z.number().finite().min(-90).max(90),
  lng:z.number().finite().min(-180).max(180),
  customerName:shortText,phone:shortText,notes:z.string().max(4000).optional(),orderNumber:shortText,
  timeWindowStart:shortText,timeWindowEnd:shortText,hasTimePreference:z.boolean().optional(),
  addressString:shortText,complemento:shortText,street:shortText,neighborhood:shortText,city:shortText,state:shortText,
  zipCode:shortText,rua:shortText,numero:shortText,bairro:shortText,cidade:shortText,uf:shortText,cep:shortText,
  originalAddressParts:addressParts.optional(),
  validationIssues:z.array(z.string().max(500)).max(30).optional(),hasValidationIssues:z.boolean().optional(),
  geocodedAddress:shortText,addressSeverity:z.enum(['grave','conferir']).optional(),
});

export const staffRouteDraftSchema=z.object({
  commandId:z.string().uuid(),
  name:z.string().trim().min(1).max(150),
  origin:staffPlannedPlaceSchema.strict(),
  stops:z.array(staffPlannedPlaceSchema.strict()).min(1).max(400),
  plannedDate:z.string().datetime({offset:true}),
  routeDate:z.union([z.string().datetime({offset:true}),z.literal('')]),
  routeTime:z.string().regex(/^\d{2}:\d{2}$/),
}).strict();
