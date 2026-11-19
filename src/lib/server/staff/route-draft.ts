import { FieldValue,Timestamp,type Firestore } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import { staffRouteDraftSchema } from '../../staff/route-contract.ts';
import { EarningsError } from '../earnings/transport.ts';

export async function createStaffDraft(db:Firestore,actor:{userId:string;sourceUid?:string},value:unknown) {
  const draft=staffRouteDraftSchema.parse(value);
  const fingerprint=factsHash({actor:actor.userId,draft});
  const receipt=db.collection('rotaStaffCommands').doc(draft.commandId);
  const route=db.collection('routes').doc();
  return db.runTransaction(async tx=>{
    const prior=await tx.get(receipt);
    if (prior.exists) {
      if (prior.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return {routeId:prior.get('resultRouteId') as string,replayed:true};
    }
    tx.create(route,{
      name:draft.name,origin:draft.origin,stops:draft.stops,routeDate:draft.routeDate,routeTime:draft.routeTime,
      status:'draft',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      plannedDate:Timestamp.fromDate(new Date(draft.plannedDate)),encodedPolyline:'',distanceMeters:0,duration:'0s',
      organizedRoutes:null,createdBy:actor.sourceUid ?? actor.userId,
    });
    tx.create(receipt,{fingerprint,resultRouteId:route.id,actorId:actor.userId,createdAt:FieldValue.serverTimestamp()});
    return {routeId:route.id,replayed:false};
  });
}
