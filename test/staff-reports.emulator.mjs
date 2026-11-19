import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applyStaffReportCommand, readStaffReport } from '../src/lib/server/staff/reports.ts';
import { readLegacyReportReceipt, reconcileStaffReportWithAi } from '../src/lib/server/staff/reports-ai.ts';
import { staffRouteRevision } from '../src/lib/server/staff/route-commands.ts';
import { previewStaffRouteCodes, repairStaffRouteCodes, resendStaffHistoryRoute } from '../src/lib/server/staff/history-commands.ts';
import { readStaffRouteHistory, readStaffRouteRemovals, readStaffActivities } from '../src/lib/server/staff/history.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
const app=initializeApp({projectId:'demo-rotaexata-staff-reports'},'staff-reports-tests');
const db=getFirestore(app);
const actor={userId:'10000000-0000-4000-8000-000000000001',sourceUid:'staff-source-test',name:'Operador Local',role:'admin'};
const fixture=()=>{
  const id=randomUUID();
  const refs=[];
  return {
    id,
    ref:(collection,key=id)=>{
      const ref=db.collection(collection).doc(key);
      refs.push(ref);
      return ref;
    },
    clean:()=>Promise.all(refs.map(ref=>ref.delete())),
  };
};
const command=(f,collection,kind,auditIndices=[])=>{
  const id=randomUUID();
  f.ref(collection,id);
  for (const index of auditIndices) f.ref('activity_log','staff-'+kind+'-'+id+(index===null?'':'-'+index));
  return id;
};
const revision=async ref=>staffRouteRevision((await ref.get()).updateTime);
after(async()=>{await db.terminate();await deleteApp(app);});

test('report edit is atomic, preserves proof and unrelated fields, and uses only the bound order',async()=>{
  const f=fixture();
  const route=f.ref('routes');
  const order=f.ref('orders');
  const unrelated=f.ref('orders',randomUUID());
  const service=f.ref('services');
  const proof=f.ref('rotaEarningRouteEvidence');
  const completion=Timestamp.now();
  const requestId=command(f,'rotaStaffReportCommands','report',[0]);
  const reconcileId=command(f,'rotaStaffReportCommands','report',[0]);
  const unReconcileId=command(f,'rotaStaffReportCommands','report',[0]);
  const payment={id:'p',method:'pix',value:51.20};
  const stop={id:'point-a',deliveryStatus:'failed',completedAt:completion,attemptPhotoUrl:'/fixture/inherited/attempt',
    photoUrl:'/fixture/inherited/receipt',signatureUrl:'/fixture/inherited/signature',customerName:'Cliente',orderNumber:f.id,
    failureReason:'ausente',wentToLocation:true,reconciled:true,notes:'observação bit a bit',customFact:{v:2}};
  try {
    await Promise.all([
      route.set({status:'completed',source:'lunna',plannedDate:completion,serviceId:service.id,stops:[stop,{id:'point-b',notes:'manter'}]}),
      service.set({status:'completed',stats:{completedDeliveries:0,failedDeliveries:1}}),
      order.set({number:f.id,rotaExataRouteId:route.id,logisticsStatus:'falha'}),
      unrelated.set({number:f.id,rotaExataRouteId:'unrelated',logisticsStatus:'em_rota'}),
      proof.set({completion:{kind:'driver-server-v1',digest:'original'},start:{confirmations:{a:{status:'failed'}}}}),
    ]);
    const oldRevision=await revision(route);
    const input={kind:'edit',routeId:route.id,revision:oldRevision,commandId:requestId,stop:{id:'point-a',index:0},
      values:{status:'completed',payments:[payment],adminEditReason:'Correção operacional verificada'}};
    assert.equal((await applyStaffReportCommand(db,actor,input)).orderSyncWarning,false);
    const current=await route.get();
    assert.equal(current.get('stops')[0].deliveryStatus,'completed');
    for (const key of ['photoUrl','signatureUrl','attemptPhotoUrl','notes','wentToLocation']) assert.deepEqual(current.get('stops')[0][key],stop[key]);
    assert.deepEqual(current.get('stops')[0].completedAt,completion);
    assert.deepEqual(current.get('stops')[0].customFact,{v:2});
    assert.deepEqual(current.get('stops')[1],{id:'point-b',notes:'manter'});
    assert.equal(current.get('stops')[0].reconciled,undefined);
    assert.equal((await proof.get()).get('completion.digest'),'original');
    assert.equal((await order.get()).get('logisticsStatus'),'entregue');
    assert.equal((await unrelated.get()).get('logisticsStatus'),'em_rota');
    assert.equal((await service.get()).get('stats.completedDeliveries'),1);
    assert.equal((await service.get()).get('stats.failedDeliveries'),0);
    assert.equal((await f.ref('activity_log','staff-report-'+requestId+'-0').get()).get('canonicalUserId'),actor.userId);
    assert.equal((await applyStaffReportCommand(db,actor,input)).replayed,true);
    await assert.rejects(applyStaffReportCommand(db,actor,{...input,stop:{id:'wrong',index:0}}),{status:409});
    await assert.rejects(applyStaffReportCommand(db,actor,{...input,commandId:randomUUID()}),{status:409,code:'staff_route_conflict'});
    const manual={kind:'reconcile',routeId:route.id,revision:await revision(route),commandId:reconcileId,
      stops:[{id:'point-a',index:0}],reconciled:true};
    assert.equal((await applyStaffReportCommand(db,actor,manual)).updated,1);
    assert.equal((await route.get()).get('stops')[0].reconciledMethod,'manual');
    await applyStaffReportCommand(db,actor,{...manual,revision:await revision(route),commandId:unReconcileId,reconciled:false});
    assert.equal((await route.get()).get('stops')[0].reconciledMethod,undefined);
  } finally {await f.clean();}
});

test('planned report pages keep descending ID tie-break cursors, local-date instants and reduced numbers projection',async()=>{
  const f=fixture();
  const planned=Timestamp.fromDate(new Date('2026-09-01T03:05:00.000Z'));
  try {
    const rows=Array.from({length:51},(_,index)=>f.ref('routes',f.id+'-'+String(index).padStart(3,'0')));
    await Promise.all(rows.map((ref,index)=>ref.set({plannedDate:planned,status:index===0?'draft':'completed',
      privateField:'exclude',stops:[{id:'s',phone:'(11) 0000-0000',completedAt:planned,
        payments:[{id:'p',method:'pix',value:25}],photoUrl:'private-proof',hidden:'exclude'}]})));
    const filter={view:'numbers',clock:'planned',start:'2026-09-01T03:00:00.000Z',end:'2026-09-02T03:00:00.000Z'};
    const first=await readStaffReport(db,filter);
    assert.equal(first.routes.length,50);
    assert.ok(first.cursor);
    const second=await readStaffReport(db,{...filter,cursor:first.cursor});
    assert.equal(second.routes.length,1);
    assert.equal(second.cursor,null);
    assert.deepEqual([...first.routes,...second.routes].map(row=>row.id),rows.map(ref=>ref.id).reverse());
    assert.equal(second.routes[0].status,'draft');
    const row=first.routes[0];
    assert.equal(row.stops[0].phone,'(11) 0000-0000');
    assert.equal(row.stops[0].payments,undefined);
    assert.equal(row.stops[0].photoUrl,undefined);
    assert.equal(row.privateField,undefined);
    const completed=await readStaffReport(db,{...filter,view:'general',clock:'completed'});
    assert.deepEqual(completed.routes.map(row=>row.id),rows.slice(1).map(ref=>ref.id));
    assert.match(completed.routes[0].stops[0].photoUrl,/^\/api\/staff\/media\/legacy\./);
    const adjacent=await readStaffReport(db,{...filter,view:'general',clock:'completed',
      start:'2026-08-31T03:00:00.000Z',end:'2026-09-01T03:00:00.000Z'});
    assert.equal(adjacent.routes.length,0);
  } finally {await f.clean();}
});

test('AI verifies private receipt ownership and CAS after analysis, then replays a committed result',async()=>{
  const f=fixture();
  const route=f.ref('routes');
  const media=f.ref('driverDeliveryMedia');
  const key='id:stop';
  const photoUrl='/api/driver/media/'+media.id;
  const requestId=command(f,'rotaStaffReportAiCommands','report',[0]);
  const revokedId=command(f,'rotaStaffReportAiCommands','report',[0]);
  const deniedId=command(f,'rotaStaffReportAiCommands','report',[0]);
  const validId=command(f,'rotaStaffReportAiCommands','report',[0]);
  try {
    await Promise.all([
      media.set({routeId:route.id,stopKey:'id:wrong',kind:'delivery',url:photoUrl,contentType:'image/jpeg'}),
      route.set({status:'in_progress',stops:[{id:'stop',deliveryStatus:'completed',photoUrl,expectedValue:33,
        payments:[{method:'pix',value:32}]}]}),
    ]);
    let reads=0;
    let analyses=0;
    const services={verifyAuthority:async()=>{},readPrivatePhoto:async()=>{reads++;return 'data:image/jpeg;base64,YQ==';},
      analyze:async()=>{analyses++;return {success:true,extractedValue:33.5};}};
    const payload={routeId:route.id,revision:await revision(route),stops:[{id:'stop',index:0}]};
    const denied=await reconcileStaffReportWithAi(db,actor,{...payload,commandId:deniedId},services);
    assert.equal(denied[0].success,false);
    assert.equal(reads,0);
    await media.update({stopKey:key});
    await assert.rejects(reconcileStaffReportWithAi(db,actor,{...payload,commandId:requestId},{
      ...services,analyze:async()=>{await route.update({operatorEdited:true});return {success:true,extractedValue:33.5};},
    }),{status:409,code:'staff_route_conflict'});
    assert.equal((await route.get()).get('stops')[0].reconciled,undefined);
    const latest=await revision(route);
    await assert.rejects(reconcileStaffReportWithAi(db,actor,{...payload,revision:latest,commandId:revokedId},{
      ...services,analyze:async()=>({success:true,extractedValue:33}),
      verifyAuthority:async()=>{throw new Error('revoked');},
    }),/revoked/);
    assert.equal((await route.get()).get('stops')[0].reconciled,undefined);
    const input={...payload,revision:latest,commandId:validId};
    const result=await reconcileStaffReportWithAi(db,actor,input,services);
    assert.equal(result[0].reconciled,true);
    assert.equal(result[0].difference,.5);
    assert.deepEqual(await reconcileStaffReportWithAi(db,actor,input,services),result);
    assert.equal(analyses,1);
    assert.equal(reads,3);
    assert.equal((await route.get()).get('stops')[0].reconciledBy,actor.sourceUid);
    await assert.rejects(readLegacyReportReceipt('https://127.0.0.1/photo','fixture.test'),{status:422});
    await assert.rejects(readLegacyReportReceipt('https://storage.googleapis.com/fixture.test/photo','fixture.test',async()=>
      new Response('large',{headers:{'content-type':'image/png','content-length':'99999999'}})),{status:422});
  } finally {await f.clean();}
});

test('history resend and code repair are atomic and replay without duplicate dispatch or assignment',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const route=f.ref('routes');
  const service=f.ref('services');
  const newCode=f.ref('routes',f.id+'-new-code');
  const conflict=f.ref('routes',f.id+'-existing-code');
  const counter=f.ref('counters','routeCode');
  const sendId=command(f,'rotaStaffHistoryResends','resend',[null]);
  const codeId=command(f,'rotaStaffHistoryCodeRepairs','code',[0]);
  const timestamp=Timestamp.now();
  let sent=0;
  let pushStarted;
  let releasePush;
  const started=new Promise(resolve=>{pushStarted=resolve;});
  const timeout=new Promise(resolve=>{releasePush=resolve;});
  const dispatch=async data=>{
    assert.equal(data.driverId,driver.id);
    sent++;
    pushStarted();
    await timeout;
    return {outcome:'accepted',messageId:'fake-msg'};
  };
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      route.set({status:'completed_auto',autoCompletedAt:timestamp,serviceId:service.id,driverId:driver.id,
        code:'LN-1000',stops:[{id:'stop',deliveryStatus:'completed',photoUrl:'original'}]}),
      service.set({status:'completed',completedAt:timestamp,stats:{completedRoutes:1,completedDeliveries:1}}),
      newCode.set({name:'Rota sem código',stops:[{id:'other',notes:'manter'}]}),
      conflict.set({name:'Código existente',code:'RT-0001'}),
      counter.set({count:0}),
    ]);
    const history=await readStaffRouteHistory(db,driver.id);
    assert.equal(history.routes[0].id,route.id);
    assert.equal(history.routes[0].autoCompletedAt,timestamp.toDate().toISOString());
    const selection={routeId:route.id,revision:history.routes[0].revision,commandId:sendId};
    const current=resendStaffHistoryRoute(db,actor,selection,dispatch);
    const claim=await Promise.race([started.then(()=>true),current.then(()=>false)]);
    assert.equal(claim,true);
    try {
      const concurrent=await resendStaffHistoryRoute(db,actor,selection,dispatch);
      assert.equal(concurrent.replayed,true);
      assert.equal(concurrent.push,'failed');
      assert.equal(sent,1);
    } finally {
      releasePush();
      assert.equal((await current).push,'accepted');
    }
    assert.equal((await resendStaffHistoryRoute(db,actor,selection,dispatch)).push,'accepted');
    assert.equal((await route.get()).get('status'),'dispatched');
    assert.deepEqual((await route.get()).get('autoCompletedAt'),timestamp);
    assert.equal((await route.get()).get('stops')[0].photoUrl,'original');
    assert.equal((await service.get()).get('status'),'dispatched');
    assert.equal((await service.get()).get('completedAt'),undefined);
    assert.equal((await readStaffRouteHistory(db,driver.id)).routes.length,0);
    const preview=await previewStaffRouteCodes(db);
    const candidate=preview.routes.find(row=>row.id===newCode.id);
    assert.ok(candidate);
    assert.equal((await newCode.get()).get('code'),undefined);
    const repair={routes:[{id:candidate.id,revision:candidate.revision}],commandId:codeId};
    await assert.rejects(repairStaffRouteCodes(db,actor,repair),{code:'staff_route_counter_conflict'});
    await Promise.all([counter.update({count:100}),newCode.update({notes:'editou após simulação'})]);
    await assert.rejects(repairStaffRouteCodes(db,actor,repair),{code:'staff_route_code_conflict'});
    const revised={...repair,routes:[{id:newCode.id,revision:await revision(newCode)}]};
    const fixed=await repairStaffRouteCodes(db,actor,revised);
    assert.deepEqual(fixed.routes,[{id:newCode.id,code:'RT-0101'}]);
    assert.equal((await repairStaffRouteCodes(db,actor,revised)).replayed,true);
    assert.equal((await counter.get()).get('count'),101);
    assert.equal((await newCode.get()).get('stops')[0].notes,'manter');
    assert.ok((await readStaffActivities(db)).activities.some(row=>row.eventType==='route_resent'));
  } finally {await f.clean();}
});

test('historical removals require a completed route and match the related transfer',async()=>{
  const f=fixture();
  const route=f.ref('routes');
  const event=f.ref('activity_log',f.id+'-event');
  const move=f.ref('activity_log',f.id+'-move');
  try {
    await Promise.all([
      route.set({status:'completed_auto',stops:[{id:'still-active'}]}),
      event.set({timestamp:Timestamp.now(),eventType:'point_removed_from_route',routeId:route.id,pointId:f.id,metadata:{secret:'redacted'}}),
      move.set({timestamp:Timestamp.now(),eventType:'point_transferred',routeId:'dest',pointId:f.id,
        metadata:{sourceRouteId:route.id,targetRouteId:'dest',targetRouteName:'Destino'}}),
    ]);
    const {removed}=await readStaffRouteRemovals(db,route.id);
    assert.equal(removed[0].related.routeId,'dest');
    assert.equal(removed[0].metadata.secret,undefined);
    await route.update({status:'dispatched'});
    await assert.rejects(readStaffRouteRemovals(db,route.id),{status:404});
  } finally {await f.clean();}
});
