import { FieldPath, FieldValue, Timestamp, type DocumentData, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import { driverTimestamp } from '../../driver/runtime-contract.ts';
import { reportRouteDate, reportStatuses, type ReportCommand, type ReportSelection, type ReportStopRef } from '../../staff/reports-contract.ts';
import { routeDocumentId } from '../../staff/route-contract.ts';
import { EarningsError } from '../earnings/transport.ts';
import { staffRouteRevision } from './route-commands.ts';
import { projectStaffEvidencePlace } from './route-projection.ts';

const pageSize=50;
type ReportOperator={userId:string;name:string;sourceUid?:string;role:string};

function readCursor(cursor:string,planned:boolean) {
  let value:unknown;
  try { value=JSON.parse(Buffer.from(cursor,'base64url').toString()); } catch { /* validated below */ }
  if (!Array.isArray(value) || value.length!==(planned ? 3:1) || !routeDocumentId.safeParse(value[0]).success ||
    (planned && (!Number.isSafeInteger(value[1]) || value[1]<-62135596800 || value[1]>253402300799 ||
      !Number.isInteger(value[2]) || value[2]<0 || value[2]>=1e9))) {
    throw new EarningsError(422,'staff_invalid_query');
  }
  return value;
}

export async function readStaffReport(db:Firestore,selection:ReportSelection) {
  const planned=selection.clock==='planned';
  let query:Query=db.collection('routes').select('plannedDate','status','name','code','driverInfo.name','stops');
  query=planned ? query.where('plannedDate','>=',Timestamp.fromMillis(Date.parse(selection.start)))
    .where('plannedDate','<',Timestamp.fromMillis(Date.parse(selection.end))).orderBy('plannedDate','desc') :
    query.where('status','in',reportStatuses);
  // Match the existing plannedDate index's implicit document ID direction.
  query=query.orderBy(FieldPath.documentId(),planned ? 'desc':'asc');
  if (selection.cursor) {
    const [id,seconds,nanos]=readCursor(selection.cursor,planned);
    query=planned ? query.startAfter(new Timestamp(seconds,nanos),id) : query.startAfter(id);
  }
  const page=await query.limit(pageSize+1).get();
  const docs=page.docs.slice(0,pageSize);
  const routes=docs.flatMap(doc=>{
    const route=doc.data();
    if (selection.view==='general' && !reportStatuses.some(status=>status===route.status)) return [];
    const stops=Array.isArray(route.stops) ? route.stops:[];
    const sortDate=reportRouteDate({...route,stops},selection);
    if (!sortDate) return [];
    return [{
      id:doc.id,revision:selection.view==='general' ? staffRouteRevision(doc.updateTime):undefined,
      code:typeof route.code==='string' ? route.code:undefined,
      name:typeof route.name==='string' ? route.name:'Rota sem nome',
      driverInfo:{name:typeof route.driverInfo?.name==='string' ? route.driverInfo.name:''},
      status:typeof route.status==='string' ? route.status:undefined,
      plannedDate:driverTimestamp(route.plannedDate),sortDate,
      stops:stops.map(value=>{
        if (!value || typeof value!=='object') return null;
        const stop=projectStaffEvidencePlace(doc.id,value);
        if (selection.view==='numbers') {
          const {customerName,phone,address,addressString,complemento,orderNumber,notes,deliveryStatus}=stop;
          return {customerName,phone,address,addressString,complemento,orderNumber,notes,deliveryStatus};
        }
        const {id,customerName,phone,address,addressString,street,rua,city,cidade,orderNumber,notes,
          deliveryStatus,completedAt,arrivedAt,failureReason,wentToLocation,photoUrl,signatureUrl,
          attemptPhotoUrl,payments,reconciled,reconciledAt,reconciledBy,reconciledMethod,aiExtractedValue,expectedValue}=stop;
        return {id,customerName,phone,address,addressString,street,rua,city,cidade,orderNumber,notes,
          deliveryStatus,completedAt,arrivedAt,failureReason,wentToLocation,photoUrl,signatureUrl,
          attemptPhotoUrl,payments,reconciled,reconciledAt,reconciledBy,reconciledMethod,aiExtractedValue,expectedValue};
      }),
    }];
  });
  const last=docs.at(-1);
  const date=planned ? last?.get('plannedDate') as Timestamp|undefined:undefined;
  const cursor=last && page.size>pageSize ?
    Buffer.from(JSON.stringify(date ? [last.id,date.seconds,date.nanoseconds]:[last.id])).toString('base64url'):null;
  return {routes,cursor};
}

export function reportTarget(stops:DocumentData[],target:ReportStopRef) {
  const stop=stops[target.index];
  if (!stop || typeof stop!=='object' || stop.unlinkedAt ||
      (typeof stop.id==='string' && stop.id ? stop.id!==target.id : target.id!==undefined)) {
    throw new EarningsError(409,'staff_report_stop_conflict');
  }
  return stop;
}

export function verifyReportRoute(snapshot:{exists:boolean;updateTime?:Timestamp;data:()=>DocumentData|undefined},revision:string) {
  const data=snapshot.data();
  if (!data || !reportStatuses.some(status=>status===data.status)) throw new EarningsError(404,'staff_route_not_found');
  if (staffRouteRevision(snapshot.updateTime)!==revision) throw new EarningsError(409,'staff_route_conflict');
  return data;
}

export function writeReportAudit(db:Firestore,tx:Transaction,actor:ReportOperator,routeId:string,route:DocumentData,
  stop:DocumentData,commandId:string,index:number,kind:'edit'|'manual'|'ai',changes:DocumentData[]) {
  const pointId=stop.id ?? stop.pointCode ?? stop.placeId ?? String(index);
  tx.create(db.collection('activity_log').doc('staff-report-'+commandId+'-'+index),{
    eventType:kind==='edit'?'point_data_updated':'bank_reconciliation',
    category:kind==='edit'?'LOGISTICS':'FINANCIAL',
    userId:actor.sourceUid ?? actor.userId, canonicalUserId:actor.userId,userName:actor.name,userRole:actor.role,
    entityId:pointId,entityType:'point',entityCode:stop.pointCode ?? null,
    pointId,pointCode:stop.pointCode ?? null,routeId,routeCode:route.code ?? null,
    serviceId:route.serviceId ?? null,serviceCode:route.serviceCode ?? null,
    timestamp:FieldValue.serverTimestamp(),action:kind==='edit'?'Dados da entrega corrigidos':'Conciliação bancária atualizada',
    changes,metadata:{customerName:stop.customerName ?? null,method:kind},
  });
}

function removeReconciliation(stop:DocumentData) {
  const {reconciled,reconciledAt,reconciledBy,reconciledMethod,aiExtractedValue,...remaining}=stop;
  return remaining;
}

export async function applyStaffReportCommand(db:Firestore,actor:ReportOperator,command:ReportCommand) {
  const routeId=command.routeId;
  const routeRef=db.collection('routes').doc(routeId);
  const receiptRef=db.collection('rotaStaffReportCommands').doc(command.commandId);
  const fingerprint=factsHash({actorId:actor.userId,command});
  return db.runTransaction(async tx=>{
    const [receipt,snapshot]=await tx.getAll(receiptRef,routeRef);
    if (receipt.exists) {
      if (receipt.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return {...(receipt.get('result') as {updated:number;orderSyncWarning:boolean}),replayed:true};
    }
    const route=verifyReportRoute(snapshot,command.revision);
    const updatedStops:DocumentData[]=Array.isArray(route.stops) ? [...route.stops]:[];
    const now=Timestamp.now();
    const who=actor.sourceUid ?? actor.userId;
    let updated=0;
    let orderSyncWarning=false;

    if (command.kind==='edit') {
      const {stop:target,values}=command;
      const prior=reportTarget(updatedStops,target);
      const priorStatus=prior.deliveryStatus ?? null;
      const statusChanged=priorStatus!==values.status;
      const beforePayments=Array.isArray(prior.payments) ? prior.payments:[];
      const payments=values.status==='completed' ? values.payments.map(payment=>{
        const previous=beforePayments.find(row=>row?.id===payment.id && row?.method===payment.method);
        const {installments,pixType,...other}=previous ?? {};
        return {...other,...payment};
      }):[];
      const paymentsChanged=factsHash(beforePayments)!==factsHash(payments);
      const orderNumber=typeof prior.orderNumber==='string' || typeof prior.orderNumber==='number' ? prior.orderNumber:null;
      const orderCandidates=route.source==='lunna' && orderNumber ?
        await tx.get(db.collection('orders').where('number','==',orderNumber).where('rotaExataRouteId','==',routeId).limit(2)):null;
      const linked=orderCandidates?.docs ?? [];
      orderSyncWarning=route.source==='lunna' && linked.length!==1;
      const serviceId=routeDocumentId.safeParse(route.serviceId);
      const service=statusChanged && serviceId.success ? await tx.get(db.collection('services').doc(serviceId.data)):null;
      const related=service?.exists ? await tx.get(db.collection('routes').where('serviceId','==',service.id)):null;

      let next:DocumentData={...prior,deliveryStatus:values.status,completedAt:prior.completedAt ?? now,
        editedByAdmin:true,adminEditedAt:now,adminEditedBy:who,adminEditReason:values.adminEditReason};
      if (values.status==='completed') {
        next.payments=payments;
        delete next.failureReason;
      } else {
        next.failureReason=values.failureReason;
        next.wentToLocation=prior.wentToLocation ?? false;
        delete next.payments;
      }
      if (statusChanged || paymentsChanged) next=removeReconciliation(next);
      updatedStops[target.index]=next;

      if (linked.length===1) tx.update(linked[0].ref,{logisticsStatus:values.status==='completed'?'entregue':'falha',updatedAt:now});
      if (service && related) {
        const stops=related.docs.flatMap(row=>row.id===routeId ? updatedStops : Array.isArray(row.get('stops')) ? row.get('stops'):[]);
        tx.update(service.ref,{
          'stats.completedDeliveries':stops.filter(stop=>stop && !stop.unlinkedAt && stop.deliveryStatus==='completed').length,
          'stats.failedDeliveries':stops.filter(stop=>stop && !stop.unlinkedAt && stop.deliveryStatus==='failed').length,
          updatedAt:now,
        });
      }
      const changes=[
        {field:'adminEditReason',oldValue:prior.adminEditReason ?? null,newValue:values.adminEditReason,fieldLabel:'Motivo da correção'},
        ...(statusChanged?[{field:'deliveryStatus',oldValue:priorStatus,newValue:values.status,fieldLabel:'Status da entrega'}]:[]),
        ...(paymentsChanged?[{field:'payments',oldValue:beforePayments,newValue:payments,fieldLabel:'Pagamentos'}]:[]),
        ...((prior.failureReason ?? null)!==(next.failureReason ?? null)?
          [{field:'failureReason',oldValue:prior.failureReason ?? null,newValue:next.failureReason ?? null,fieldLabel:'Motivo da falha'}]:[]),
      ];
      writeReportAudit(db,tx,actor,routeId,route,next,command.commandId,target.index,'edit',changes);
      updated=1;
    } else {
      for (const target of command.stops) {
        const stop=reportTarget(updatedStops,target);
        if (stop.deliveryStatus!=='completed') throw new EarningsError(409,'staff_report_stop_not_completed');
        if ((stop.reconciled===true)===command.reconciled) continue;
        const next=command.reconciled ? {...stop,reconciled:true,reconciledAt:now,reconciledBy:who,reconciledMethod:'manual'} :
          removeReconciliation(stop);
        updatedStops[target.index]=next;
        writeReportAudit(db,tx,actor,routeId,route,next,command.commandId,target.index,'manual',
          [{field:'reconciled',oldValue:!command.reconciled,newValue:command.reconciled,fieldLabel:'Conciliação'}]);
        updated++;
      }
    }

    if (updated) tx.update(routeRef,{stops:updatedStops,lastModifiedAt:now,lastModifiedBy:who});
    const result={updated,orderSyncWarning};
    tx.create(receiptRef,{fingerprint,result,actorId:actor.userId,createdAt:now});
    return {...result,replayed:false};
  });
}
