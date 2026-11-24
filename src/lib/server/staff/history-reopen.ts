import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import { buildReopenHistoryEntry, resolveReopen, type ReopenableRoute, type ReopenRefusal } from '../../../../functions/src/route-reopen.ts';
import type { StaffPushOutcome } from './push-delivery';
import type { HistoryReopenSelection } from '../../staff/history-contract.ts';
import { routeDocumentId } from '../../staff/route-contract.ts';
import { serviceStatsAfterReopen } from '../../staff/service-after-reopen.ts';
import { isSourceDriverAssignable } from '../../dispatch-driver.ts';
import { EarningsError } from '../earnings/transport.ts';
import { staffRouteRevision } from './route-commands.ts';

/**
 * Reabertura de rota finalizada pelo painel nativo (par de `resendStaffHistoryRoute`).
 *
 * As regras (quem pode ser reaberta, para onde volta, pagamento) vivem em
 * functions/src/route-reopen.ts e sao as mesmas do callable legado. Aqui ficam
 * a idempotencia por `commandId`, a checagem de revisao e o aviso ao motorista.
 */
type Operator={userId:string;name:string;sourceUid?:string;role:string};
type ReopenDelivery={routeId:string;driverId:string;profile:DocumentData};
type Target='dispatched'|'in_progress';

const refusals:Record<ReopenRefusal,[number,string]>={
  'status-invalido':[409,'staff_route_conflict'],
  'sem-motorista':[409,'staff_driver_unavailable'],
  'pagamento-fechado':[409,'staff_route_payment_closed'],
};
const unavailable=()=>new EarningsError(409,'staff_driver_unavailable');
const activeDriver=(profile:DocumentData|undefined)=>
  !!profile && profile.active!==false && profile.disabled!==true && isSourceDriverAssignable(profile);

export async function reopenStaffHistoryRoute(db:Firestore,actor:Operator,command:HistoryReopenSelection,
  send:(input:ReopenDelivery)=>Promise<StaffPushOutcome>) {
  const routeRef=db.collection('routes').doc(command.routeId);
  const commandRef=db.collection('rotaStaffHistoryReopens').doc(command.commandId);
  const fingerprint=factsHash({actorId:actor.userId,command});
  const reopened=await db.runTransaction(async tx=>{
    const [prior,route]=await tx.getAll(commandRef,routeRef);
    if (prior.exists) {
      if (prior.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return {replayed:true,targetStatus:prior.get('targetStatus') as Target,hasPendingPayment:prior.get('hasPendingPayment') as boolean};
    }
    if (!route.exists) throw new EarningsError(404,'staff_route_not_found');
    if (staffRouteRevision(route.updateTime)!==command.revision) throw new EarningsError(409,'staff_route_conflict');

    const payments=await tx.get(db.collection('driverPayments').where('routeId','==',route.id));
    const decision=resolveReopen(route.data() as ReopenableRoute,payments.docs.map(payment=>({id:payment.id,status:payment.get('status')})));
    if (!decision.ok) throw new EarningsError(...refusals[decision.reason]);
    const driverId=routeDocumentId.safeParse(route.get('driverId'));
    if (!driverId.success) throw unavailable();
    const profile=(await tx.get(db.collection('users').doc(driverId.data))).data();
    if (!profile || !activeDriver(profile)) throw unavailable();
    const serviceId=routeDocumentId.safeParse(route.get('serviceId'));
    const service=serviceId.success ? await tx.get(db.collection('services').doc(serviceId.data)):null;
    const siblings=service?.exists ? await tx.get(db.collection('routes').where('serviceId','==',service.id)):null;

    const when=FieldValue.serverTimestamp();
    const who=actor.sourceUid ?? actor.userId;
    const previous=route.get('status') as string;
    tx.update(routeRef,{
      status:decision.targetStatus,
      reopenedAt:when,reopenedBy:who,reopenReason:command.reason,reopenCount:FieldValue.increment(1),
      reopenHistory:FieldValue.arrayUnion(buildReopenHistoryEntry(route.data() as ReopenableRoute,{at:Timestamp.now(),by:who,reason:command.reason})),
      completedAt:FieldValue.delete(),autoCompletedAt:FieldValue.delete(),completedBy:FieldValue.delete(),
      staffHistoryReopenId:command.commandId,
    });
    // Pagamento pendente continua valido, mas o financeiro precisa saber que a
    // rota sera finalizada de novo e o calculo pode mudar.
    const stamp=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
    for (const payment of payments.docs) {
      if (!decision.pendingPaymentIds.includes(payment.id)) continue;
      const note=payment.get('notes');
      tx.update(payment.ref,{
        notes:(note ? note+'\n':'')+'Rota reaberta em '+stamp+': recalcular este pagamento apos a nova finalizacao.',
        routeReopenedAt:when,updatedAt:when,
      });
    }
    if (service && siblings) {
      const stats=serviceStatsAfterReopen(
        siblings.docs.map(snapshot=>({id:snapshot.id,status:snapshot.get('status'),stops:snapshot.get('stops')})),
        route.id,decision.targetStatus);
      tx.update(service.ref,{
        status:stats.status,'stats.completedRoutes':stats.completedRoutes,'stats.completedDeliveries':stats.completedDeliveries,
        completedAt:FieldValue.delete(),updatedAt:when,
      });
    }
    const code=route.get('code') ?? route.id;
    const driverName=route.get('driverInfo.name') ?? profile.displayName ?? profile.name ?? 'Motorista';
    tx.create(db.collection('activity_log').doc('staff-reopen-'+command.commandId),{
      eventType:'route_reopened',category:'LOGISTICS',entityType:'route',entityId:route.id,entityCode:code,
      serviceId:serviceId.success ? serviceId.data:null,serviceCode:route.get('serviceCode') ?? null,routeId:route.id,routeCode:code,
      userId:who,canonicalUserId:actor.userId,userName:actor.name,userRole:actor.role,timestamp:when,
      action:`Rota ${code} reaberta ao motorista ${driverName}. Motivo: ${command.reason}`,
      metadata:{driverId:driverId.data,driverName,reason:command.reason},
      changes:[{field:'status',oldValue:previous,newValue:decision.targetStatus,fieldLabel:'Status'}],
    });
    const hasPendingPayment=decision.pendingPaymentIds.length>0;
    tx.create(commandRef,{
      fingerprint,actorId:actor.userId,routeId:route.id,driverId:driverId.data,
      targetStatus:decision.targetStatus,hasPendingPayment,state:'ready',createdAt:when,
    });
    return {replayed:false,targetStatus:decision.targetStatus,hasPendingPayment};
  });

  const claim=await db.runTransaction(async tx=>{
    const [log,route]=await tx.getAll(commandRef,routeRef);
    if (log.get('outcome')) return {outcome:log.get('outcome') as StaffPushOutcome};
    if (log.get('state')==='dispatching') return {outcome:{outcome:'uncertain'} as StaffPushOutcome};
    const driverId=log.get('driverId') as string;
    const driver=(await tx.get(db.collection('users').doc(driverId))).data();
    if (route.get('staffHistoryReopenId')!==command.commandId || route.get('driverId')!==driverId ||
      !['dispatched','in_progress'].includes(route.get('status')) || !activeDriver(driver)) {
      const outcome={outcome:'skipped_no_token'} as const;
      tx.update(commandRef,{state:'settled',outcome});
      return {outcome};
    }
    tx.update(commandRef,{state:'dispatching',startedAt:FieldValue.serverTimestamp()});
    return {delivery:{routeId:route.id,driverId,profile:driver!}};
  });

  const summary={ok:true as const,replayed:reopened.replayed,targetStatus:reopened.targetStatus,hasPendingPayment:reopened.hasPendingPayment};
  if (claim.outcome) return {...summary,push:claim.outcome.outcome};
  let outcome:StaffPushOutcome;
  try {
    outcome=await send(claim.delivery);
  } catch {
    outcome={outcome:'uncertain'};
  }
  try {await commandRef.update({state:'settled',outcome,settledAt:FieldValue.serverTimestamp()});}
  catch {return {...summary,push:'uncertain' as const};}
  return {...summary,push:outcome.outcome};
}
