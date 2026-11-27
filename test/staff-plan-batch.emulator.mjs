import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore,Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { applyStaffPlanBatch } from '../src/lib/server/staff/route-plan.ts';
import { getStopIdentityKey } from '../src/lib/route-stop-utils.ts';
import { readStaffRouteRemovals } from '../src/lib/server/staff/history.ts';
import { applyStaffEditorCommand } from '../src/lib/server/staff/editor-commands.ts';
import { staffRouteRevision } from '../src/lib/server/staff/route-commands.ts';
import { readStaffEditor } from '../src/lib/server/staff/editor-read.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');

test('staff plan rebase preserves driver proofs, applies retry once and rejects a now-finalized route',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-driver'},'staff-plan-tests');
  const db=getFirestore(app);
  const route=db.collection('routes').doc();
  const receiptIds=[];
  function id(){const value=randomUUID();receiptIds.push(value);return value;}
  try {
    const stop={id:'one',placeId:'one',address:'Rua 1',lat:-16.6,lng:-49.2};
    const completedAt=Timestamp.now();
    const proof='/api/driver/media/70000000-0000-4000-8000-000000000002';
    await route.create({status:'in_progress',driverId:'fixture-driver',stops:[
      {...stop,deliveryStatus:'completed',photoUrl:proof,completedAt,items:[{id:'lunna'}]},
      {...stop,id:'two',placeId:'two'},
    ]});
    const body={commandId:id(),existingPlans:[{routeId:route.id,baseStops:[{id:'one'},{id:'two'}],
      plannedStops:[{...stop,id:'two',placeId:'two'}, {...stop,address:'Rua 1 ajustada'}]}]};
    const actor={userId:'10000000-0000-4000-8000-000000000001',name:'Operador teste'};
    const first=await applyStaffPlanBatch(db,actor,body);
    assert.equal(first.replayed,false);
    const noticeId=first.existingRoutes[0].noticeId;
    assert.match(noticeId,/^[a-f0-9]{64}$/);
    const inbox=await db.doc('routeChangeNotifications/'+route.id).get();
    const outbox=await db.doc('rotaStaffRouteNotices/'+noticeId).get();
    assert.equal(inbox.get('staffNoticeId'),noticeId);
    assert.equal(outbox.get('state'),'pending');
    assert.equal(outbox.get('driverId'),'fixture-driver');
    const saved=(await route.get()).get('stops');
    assert.equal(saved[1].address,'Rua 1 ajustada');
    assert.equal(saved[1].photoUrl,proof);
    assert.equal(saved[1].completedAt.isEqual(completedAt),true);
    assert.equal(saved[1].items[0].id,'lunna');
    const replay=await applyStaffPlanBatch(db,actor,body);
    assert.equal(replay.replayed,true);
    const afterReplay=await db.doc('routeChangeNotifications/'+route.id).get();
    assert.equal(afterReplay.updateTime.isEqual(inbox.updateTime),true);
    assert.equal(replay.existingRoutes[0].noticeId,noticeId);
    await db.doc('rotaStaffRouteNotices/'+noticeId).delete();
    assert.equal(replay.existingRoutes[0].stops[1].photoUrl,proof);
    await route.update({status:'completed'});
    await assert.rejects(applyStaffPlanBatch(db,actor,{...body,commandId:id()}),{status:409});
  } finally {
    await Promise.all([route.delete(),db.doc('routeChangeNotifications/'+route.id).delete(),...receiptIds.flatMap(commandId=>[
      db.doc('rotaStaffCommands/'+commandId).delete(),db.doc('activity_log/staff-'+commandId).delete(),
    ])]);
    await deleteApp(app);
  }
});

test('the whole service dispatch commits with orders or leaves all records unchanged',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-planner'},'staff-plan-pair-tests');
  const db=getFirestore(app);
  const actor={userId:'10000000-0000-4000-8000-000000000001',name:'Operador teste'};
  const service=db.collection('services').doc();
  const drivers=[db.collection('users').doc(),db.collection('users').doc()];
  const orders=[db.collection('orders').doc(),db.collection('orders').doc()];
  const routes=[db.collection('routes').doc(),db.collection('routes').doc()];
  const stops=orders.map((order,index)=>({id:order.id,placeId:'synthetic-'+index,orderNumber:'S-'+order.id,address:'Rua teste',lat:-16.6,lng:-49.2}));
  const commandId=randomUUID();
  const plan={commandId,existingPlans:[],serviceLink:{serviceId:service.id,routeIds:routes.map(route=>route.id)},
    newRoutes:routes.map((route,index)=>({routeId:route.id,plannedStops:[stops[index]],data:{
      name:'Rota de teste',routeKey:index===0?'A':'B',origin:stops[index],plannedDate:'2026-11-19T10:00:00-03:00',
      status:'dispatched',driverId:' '+drivers[index].id+' ',encodedPolyline:'',distanceMeters:7000,duration:'0s',
    }})),
  };
  try {
    await Promise.all([
      service.create({code:'LNS-SYNTHETIC',status:'organizing',routeIds:[],allStops:stops.map(stop=>({...stop,expectedValue:81.45,hasExchangeItems:true,operationType:'troca',lunnaClientCode:'C-TEST',items:[{id:'a',tipo:'troca',subtotal:81.45}]}))}),
      ...drivers.map((driver,index)=>driver.create({role:'driver',active:index===0,displayName:'Motorista'})),
      ...orders.map((order,index)=>order.create({number:stops[index].orderNumber,rotaExataServiceId:service.id,logisticsStatus:'programado'})),
    ]);
    await assert.rejects(applyStaffPlanBatch(db,actor,plan),{status:409,code:'staff_driver_unavailable'});
    assert.equal((await routes[0].get()).exists,false);
    assert.deepEqual((await service.get()).get('routeIds'),[]);
    assert.equal((await orders[0].get()).get('logisticsStatus'),'programado');
    await drivers[1].update({active:true});
    const saved=await applyStaffPlanBatch(db,actor,plan);
    assert.equal(saved.replayed,false);
    assert.match(saved.createdRoutes[0].stops[0].pointCode,/LNS-SYNTHETIC-A-001/);
    const persistedStop=(await routes[0].get()).get('stops')[0];
    assert.equal(persistedStop.expectedValue,81.45);
    assert.equal(persistedStop.operationType,'troca');
    assert.equal(persistedStop.lunnaClientCode,'C-TEST');
    assert.equal(persistedStop.hasExchangeItems,true);
    assert.deepEqual(persistedStop.items,[{id:'a',tipo:'troca',subtotal:81.45}]);
    const assigned=await orders[0].get();
    assert.equal(assigned.get('rotaExataRouteId'),routes[0].id);
    assert.equal((await routes[0].get()).get('driverId'),drivers[0].id);
    assert.equal((await service.get()).get('stats.totalRoutes'),2);
    assert.equal((await service.get()).get('status'),'dispatched');
    const replay=await applyStaffPlanBatch(db,actor,plan);
    assert.equal(replay.replayed,true);
    assert.equal((await orders[0].get()).updateTime.isEqual(assigned.updateTime),true);
  } finally {
    await Promise.all([service,...drivers,...routes,...orders,db.doc('rotaStaffCommands/'+commandId),
      db.doc('activity_log/staff-'+commandId)].map(ref=>ref.delete()));
    await deleteApp(app);
  }
});

test('a concurrent driver completion survives a stale staff removal',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-fix'},'staff-plan-proof-removal');
  const db=getFirestore(app);
  const route=db.collection('routes').doc();
  const commandId=randomUUID();
  const actor={userId:'10000000-0000-4000-8000-000000000001',name:'Operador teste'};
  const stop={id:'completed',placeId:'complete',address:'Rua teste',lat:-16.6,lng:-49.2};
  try {
    await route.create({status:'in_progress',stops:[stop]});
    const plan={commandId,existingPlans:[{routeId:route.id,baseStops:[{id:stop.id}],plannedStops:[]}]};
    await route.update({stops:[{...stop,deliveryStatus:'completed',photoUrl:'/api/driver/media/70000000-0000-4000-8000-000000000002'}]});
    await assert.rejects(applyStaffPlanBatch(db,actor,plan),{status:409});
    assert.equal((await route.get()).get('stops.0.photoUrl') ?? (await route.get()).get('stops')[0].photoUrl,
      '/api/driver/media/70000000-0000-4000-8000-000000000002');
  } finally {
    await Promise.all([route.delete(),db.doc('rotaStaffCommands/'+commandId).delete(),db.doc('activity_log/staff-'+commandId).delete()]);
    await deleteApp(app);
  }
});

test('unlink removes just the specified Source-order linkage in the same retriable commit',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-fix'},'staff-plan-unlink');
  const db=getFirestore(app);
  const route=db.collection('routes').doc();
  const service=db.collection('services').doc();
  const order=db.collection('orders').doc('zz-'+randomUUID());
  const collisions=Array.from({length:4},()=>db.collection('orders').doc('aa-'+randomUUID()));
  const duplicate=db.collection('orders').doc('zz-'+randomUUID());
  const commandId=randomUUID();
  const actor={userId:'10000000-0000-4000-8000-000000000001',name:'Operador teste'};
  const stop={id:'one',placeId:'one',orderNumber:'S-'+order.id,address:'Rua teste',lat:-16.6,lng:-49.2};
  const other={id:'new',placeId:'new',address:'Outro endereço',lat:-16.5,lng:-49.3};
  const rev=doc=>String(doc.updateTime.seconds).padStart(12,'0')+'.'+String(doc.updateTime.nanoseconds).padStart(9,'0');
  try {
    await Promise.all([
      route.create({status:'in_progress',serviceId:service.id,lunnaOrderIds:[stop.orderNumber],stops:[stop]}),
      service.create({status:'in_progress',routeIds:[route.id],allStops:[stop,other],stats:{totalDeliveries:2}}),
      order.create({number:stop.orderNumber,rotaExataServiceId:service.id,rotaExataRouteId:route.id}),
      ...collisions.map(ref=>ref.create({number:stop.orderNumber})),
      duplicate.create({number:stop.orderNumber,rotaExataServiceId:service.id,rotaExataRouteId:route.id}),
    ]);
    const plan={commandId,existingPlans:[{routeId:route.id,baseStops:[stop],plannedStops:[]}],
      unlink:{routeId:route.id,routeRevision:rev(await route.get()),serviceId:service.id,serviceRevision:rev(await service.get()),stopKey:'order:'+stop.orderNumber.toLowerCase()}};
    await assert.rejects(applyStaffPlanBatch(db,actor,plan),{status:409});
    await duplicate.delete();
    await order.update({rotaExataRouteId:'another-route'});
    await assert.rejects(applyStaffPlanBatch(db,actor,plan),{status:409});
    assert.equal((await route.get()).get('stops').length,1);
    assert.equal((await service.get()).get('allStops').length,2);
    await order.update({rotaExataRouteId:route.id});
    const result=await applyStaffPlanBatch(db,actor,plan);
    assert.equal(result.replayed,false);
    assert.equal((await route.get()).get('stops').length,0);
    const audited=await db.collection('activity_log').where('eventType','==','point_removed_from_route').where('routeId','==',route.id).get();
    assert.equal(audited.size,1);
    assert.equal(audited.docs[0].get('canonicalUserId'),actor.userId);
    assert.equal(audited.docs[0].get('staffAuditVersion'),1);
    assert.deepEqual((await service.get()).get('allStops'),[other]);
    assert.equal((await order.get()).get('rotaExataServiceId'),null);
    assert.equal((await order.get()).get('rotaExataRouteId'),null);
    assert.equal((await applyStaffPlanBatch(db,actor,plan)).replayed,true);
  } finally {
    await Promise.all([route,service,order,duplicate,...collisions,db.doc('rotaStaffCommands/'+commandId),db.doc('activity_log/staff-'+commandId)].map(ref=>ref.delete()));
    await deleteApp(app);
  }
});

test('a transfer denies evidence loss and duplicate consumption, then audits one pending transfer',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-transfer'},'staff-plan-transfer');
  const db=getFirestore(app);
  const source=db.collection('routes').doc();
  const target=db.collection('routes').doc();
  const another=db.collection('routes').doc();
  const audit=db.collection('activity_log');
  const commandId=randomUUID();
  const actor={userId:randomUUID(),scopeId:randomUUID(),name:'Operador teste'};
  const stop={id:'point-a',placeId:'fixture',lat:-16.6,lng:-49.2,address:'Rua legal'};
  const proof='/api/driver/media/70000000-0000-4000-8000-000000000002';
  const completedAt=Timestamp.now();
  const plan={commandId,existingPlans:[
    {routeId:source.id,baseStops:[stop],plannedStops:[]},
    {routeId:target.id,baseStops:[],plannedStops:[stop]},
  ],transferIntents:[{sourceRouteId:source.id,targetRouteId:target.id,stopKey:getStopIdentityKey(stop)}]};
  try {
    await Promise.all([source.create({status:'in_progress',stops:[{...stop,deliveryStatus:'completed',photoUrl:proof,completedAt}]}),
      target.create({status:'in_progress',stops:[]}),another.create({status:'in_progress',stops:[]})]);
    await assert.rejects(applyStaffPlanBatch(db,actor,plan),{status:409,code:'staff_stop_execution_exists'});
    assert.equal((await source.get()).get('stops')[0].photoUrl,proof);
    assert.deepEqual((await target.get()).get('stops'),[]);
    await source.update({stops:[{...stop,arrivedAt:completedAt}]});
    await assert.rejects(applyStaffPlanBatch(db,actor,plan),{status:409,code:'staff_stop_execution_exists'});
    await source.update({stops:[stop]});
    await assert.rejects(applyStaffPlanBatch(db,actor,{...plan,
      existingPlans:[...plan.existingPlans,{routeId:another.id,baseStops:[],plannedStops:[stop]}],
      transferIntents:[...plan.transferIntents,{...plan.transferIntents[0],targetRouteId:another.id}],
    }),/duplicate_stop_transfer/);
    await applyStaffPlanBatch(db,actor,plan);
    assert.equal((await applyStaffPlanBatch(db,actor,plan)).replayed,true);
    const stored=(await target.get()).get('stops')[0];
    assert.equal(stored.id,stop.id);
    const events=(await audit.where('staffAuditOperationId','==',commandId).get()).docs;
    assert.deepEqual(events.map(doc=>doc.get('eventType')).sort(),['point_added_to_route','point_removed_from_route','point_transferred']);
    const transferred=events.find(doc=>doc.get('eventType')==='point_transferred');
    assert.equal(transferred.get('metadata.targetRouteId'),target.id);
    assert.equal(transferred.get('canonicalUserId'),actor.userId);
    assert.equal(transferred.get('staffScopeId'),actor.scopeId);
  } finally {
    const logged=(await audit.where('staffAuditOperationId','==',commandId).get()).docs;
    await Promise.all([source,target,another,db.doc('rotaStaffCommands/'+commandId),audit.doc('staff-'+commandId),...logged.map(doc=>doc.ref)].map(ref=>ref.delete()));
    await deleteApp(app);
  }
});

test('coordinate-only removals write auditable stop IDs',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-transfer'},'staff-stop-coordinates');
  const db=getFirestore(app);
  const route=db.collection('routes').doc();
  const commandId=randomUUID();
  const actor={userId:randomUUID(),scopeId:randomUUID(),name:'Operador teste'};
  const stop={lat:-16.5,lng:-49.25};
  const audit=db.collection('activity_log');
  try {
    await route.create({status:'in_progress',stops:[stop]});
    await applyStaffPlanBatch(db,actor,{commandId,existingPlans:[{routeId:route.id,baseStops:[stop],plannedStops:[]}]});
    const events=(await audit.where('staffAuditOperationId','==',commandId).get()).docs;
    assert.equal(events.length,1);
    assert.equal(events[0].get('pointId'),getStopIdentityKey(stop));
    assert.equal(events[0].get('entityId'),getStopIdentityKey(stop));
    await route.update({status:'completed'});
    assert.equal((await readStaffRouteRemovals(db,route.id)).removed[0].pointId,getStopIdentityKey(stop));
    await route.update({stops:[stop]});
    assert.deepEqual((await readStaffRouteRemovals(db,route.id)).removed,[]);
  } finally {
    const logged=(await audit.where('staffAuditOperationId','==',commandId).get()).docs;
    await Promise.all([route,db.doc('rotaStaffCommands/'+commandId),audit.doc('staff-'+commandId),...logged.map(doc=>doc.ref)].map(ref=>ref.delete()));
    await deleteApp(app);
  }
});

async function withPoolFixture(run) {
  const app=initializeApp({projectId:'demo-rotaexata-driver'},'pool-'+randomUUID());
  const db=getFirestore(app);
  const service=db.collection('services').doc();
  const active=db.collection('routes').doc();
  const sibling=db.collection('routes').doc();
  const otherDestination=db.collection('routes').doc();
  const order=db.collection('orders').doc();
  const item={id:order.id,placeId:'fixture-pool-address',orderNumber:'S-'+order.id,address:'Rua da parada',lat:-16.6,lng:-49.2};
  const base={id:'base-stop',placeId:'base-stop',address:'Rua original',lat:-16.61,lng:-49.21};
  const evidence={id:'old-stop',address:'Rua concluída',placeId:'old-stop',deliveryStatus:'completed'};
  const actor={userId:'10000000-0000-4000-8000-000000000001',name:'Operador teste'};
  const move=(destination,kind='allocate')=>({commandId:randomUUID(),
    poolMove:{kind,routeId:destination.id,stopKey:getStopIdentityKey(item)},
    existingPlans:[{routeId:destination.id,expectedStatus:'in_progress',
      baseStops:kind==='allocate'?[{id:base.id}]:[{id:base.id},{orderNumber:item.orderNumber}],
      plannedStops:kind==='allocate'?[base,item]:[base]}],
  });
  try {
    await Promise.all([
      service.create({code:'LNS-POOL-TEST',status:'dispatched',routeIds:[active.id,sibling.id,otherDestination.id],allStops:[item]}),
      active.create({serviceId:service.id,code:'LNS-POOL-TEST-A',status:'in_progress',stops:[base],unassignedStops:[item]}),
      sibling.create({serviceId:service.id,code:'LNS-POOL-TEST-B',status:'completed',stops:[evidence],unassignedStops:[item]}),
      otherDestination.create({serviceId:service.id,code:'LNS-POOL-TEST-C',status:'in_progress',stops:[base],unassignedStops:[item]}),
      order.create({number:item.orderNumber,logisticsStatus:'em_rota',rotaExataServiceId:service.id,rotaExataRouteId:sibling.id,rotaExataRouteCode:'LNS-POOL-TEST-B'}),
    ]);
    await run({db,service,active,sibling,otherDestination,order,item,base,evidence,actor,move});
  } finally { await deleteApp(app); }
}

test('allocating a service stop clears its availability and corrects the order with a completed sibling untouched',async()=>{
  await withPoolFixture(async ({db,service,active,sibling,order,item,evidence,actor,move})=>{
    const body=move(active);
    const result=await applyStaffPlanBatch(db,actor,body);
    assert.deepEqual(result.unassignedStops,[]);
    assert.equal((await active.get()).get('stops')[1].orderNumber,item.orderNumber);
    assert.equal((await order.get()).get('rotaExataRouteId'),active.id);
    assert.deepEqual((await sibling.get()).get('stops'),[evidence]);
    assert.deepEqual((await sibling.get()).get('unassignedStops'),[item]);

    const fresh=await readStaffEditor(db,{kind:'service-routes',id:service.id});
    assert.ok(fresh.records.every(route=>!route.unassignedStops?.some(stop=>stop.orderNumber===item.orderNumber)));
    const repeated=await applyStaffPlanBatch(db,actor,body);
    assert.equal(repeated.replayed,true);
    assert.deepEqual(repeated.unassignedStops,[]);
    assert.equal((await active.get()).get('stops').length,2);
  });
});

test('returning an unvisited point to the service pool clears its route link but retains the service',async()=>{
  await withPoolFixture(async ({db,service,active,order,item,actor,move})=>{
    await applyStaffPlanBatch(db,actor,move(active));
    const returned=await applyStaffPlanBatch(db,actor,move(active,'return'));
    assert.equal(returned.unassignedStops[0].orderNumber,item.orderNumber);
    assert.equal((await active.get()).get('stops').length,1);
    const linked=await order.get();
    assert.equal(linked.get('rotaExataRouteId'),null);
    assert.equal(linked.get('rotaExataServiceId'),service.id);
    assert.equal(linked.get('logisticsStatus'),'programado');
  });
});

test('two destinations cannot reserve the same service point',async()=>{
  await withPoolFixture(async ({db,active,otherDestination,order,item,actor,move})=>{
    const results=await Promise.allSettled([
      applyStaffPlanBatch(db,actor,move(active)),
      applyStaffPlanBatch(db,actor,move(otherDestination)),
    ]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    const rejected=results.find(result=>result.status==='rejected');
    assert.equal(rejected.reason.status,409);
    const assigned=(await db.getAll(active,otherDestination)).filter(doc=>doc.get('stops').some(stop=>stop.orderNumber===item.orderNumber));
    assert.equal(assigned.length,1);
    assert.equal((await order.get()).get('rotaExataRouteId'),assigned[0].id);
  });
});

test('allocating a service point rejects an order linked to another service without saving a route change',async()=>{
  await withPoolFixture(async ({db,active,order,actor,move})=>{
    await order.update({rotaExataServiceId:'other-service'});
    const body=move(active);
    await assert.rejects(applyStaffPlanBatch(db,actor,body),{status:409,code:'staff_order_service_conflict'});
    assert.equal((await active.get()).get('stops').length,1);
    assert.equal((await db.doc('rotaStaffCommands/'+body.commandId).get()).exists,false);
  });
});

test('a destination closed since the read rejects allocation without consuming the point',async()=>{
  await withPoolFixture(async ({db,active,order,item,sibling,actor,move})=>{
    const body=move(active);
    await active.update({status:'completed'});
    await assert.rejects(applyStaffPlanBatch(db,actor,body),{status:409,code:'staff_route_closed'});
    assert.equal((await active.get()).get('unassignedStops')[0].orderNumber,item.orderNumber);
    assert.equal((await order.get()).get('rotaExataRouteId'),sibling.id);
    assert.equal((await db.doc('rotaStaffCommands/'+body.commandId).get()).exists,false);
  });
});

test('return preserves an already visited stop and evidence in the active route',async()=>{
  await withPoolFixture(async ({db,active,order,item,base,actor,move})=>{
    await applyStaffPlanBatch(db,actor,move(active));
    const visited={...item,deliveryStatus:'arrived'};
    await active.update({stops:[base,visited]});
    const body=move(active,'return');
    await assert.rejects(applyStaffPlanBatch(db,actor,body),{status:409,code:'staff_stop_execution_exists'});
    const saved=await active.get();
    assert.equal(saved.get('stops')[1].deliveryStatus,'arrived');
    assert.deepEqual(saved.get('unassignedStops'),[]);
    assert.equal((await order.get()).get('rotaExataRouteId'),active.id);
    assert.equal((await db.doc('rotaStaffCommands/'+body.commandId).get()).exists,false);
  });
});

test('standalone manual stops move between their own route and pool',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-driver'},'standalone-pool-'+randomUUID());
  const db=getFirestore(app);
  const route=db.collection('routes').doc();
  const actor={userId:randomUUID(),name:'Operador teste'};
  const point={id:'manual-pool',placeId:'place-manual',lat:-16.6,lng:-49.2,address:'Ponto manual'};
  const move=(kind,baseStops,plannedStops)=>({commandId:randomUUID(),
    poolMove:{kind,routeId:route.id,stopKey:getStopIdentityKey(point)},
    existingPlans:[{routeId:route.id,expectedStatus:'draft',baseStops,plannedStops}]});
  try {
    await route.create({status:'draft',stops:[],unassignedStops:[point]});
    await applyStaffPlanBatch(db,actor,move('allocate',[],[point]));
    assert.equal((await route.get()).get('stops')[0].id,point.id);
    const result=await applyStaffPlanBatch(db,actor,move('return',[point],[]));
    assert.equal(result.unassignedStops[0].id,point.id);
    assert.deepEqual((await route.get()).get('stops'),[]);
  } finally {
    await route.delete();
    await deleteApp(app);
  }
});

test('a confirmed service pool address correction is what the allocation persists',async()=>{
  await withPoolFixture(async ({db,service,active,item,actor,move})=>{
    const stored={...item,lat:0,lng:0,expectedValue:315};
    await service.update({allStops:[stored]});
    await active.update({unassignedStops:[stored]});
    const revised={...item,address:'Endereço corrigido',lat:-16.77,lng:-49.19};
    const target=await active.get();
    await applyStaffEditorCommand(db,actor,{
      commandId:randomUUID(),kind:'edit-pool-stop',routeId:active.id,revision:staffRouteRevision(target.updateTime),
      stopKey:getStopIdentityKey(item),stop:revised,
    });
    const body=move(active);
    body.existingPlans[0].plannedStops[1]=revised;
    const result=await applyStaffPlanBatch(db,actor,body);
    const saved=result.existingRoutes[0].stops[1];
    assert.equal(saved.address,revised.address);
    assert.equal(saved.lat,revised.lat);
    assert.equal(saved.expectedValue,315);
    assert.deepEqual((await service.get()).get('allStops'),[{...stored,...revised}]);
  });
});

test('unlink protects a manual point from revival through a completed sibling mirror',async()=>{
  await withPoolFixture(async ({db,service,active,sibling,otherDestination,base,actor})=>{
    const point={id:'manual-under-service',placeId:'hand-entered',address:'Avulso manual',lat:-16.6,lng:-49.2};
    await service.update({allStops:[point]});
    await active.update({stops:[base,point],unassignedStops:[]});
    await sibling.update({unassignedStops:[point]});
    await otherDestination.update({unassignedStops:[]});
    const [source,member]=await db.getAll(active,service);
    await applyStaffPlanBatch(db,actor,{
      commandId:randomUUID(),existingPlans:[{routeId:active.id,baseStops:[base,point],plannedStops:[base]}],
      unlink:{routeId:active.id,serviceId:service.id,routeRevision:staffRouteRevision(source.updateTime),
        serviceRevision:staffRouteRevision(member.updateTime),stopKey:getStopIdentityKey(point)},
    });
    const records=(await readStaffEditor(db,{kind:'service-routes',id:service.id})).records;
    assert.ok(records.every(route=>!(route.unassignedStops ?? []).some(item=>item.id===point.id)));
    await assert.rejects(applyStaffPlanBatch(db,actor,{
      commandId:randomUUID(),poolMove:{kind:'allocate',routeId:active.id,stopKey:getStopIdentityKey(point)},
      existingPlans:[{routeId:active.id,expectedStatus:'in_progress',baseStops:[base],plannedStops:[base,point]}],
    }),{status:409});
    assert.deepEqual((await sibling.get()).get('unassignedStops'),[point]);
  });
});

test('a newly created service route cannot claim a point allocated by another route draft',async()=>{
  await withPoolFixture(async ({db,service,active,item,actor,move})=>{
    await active.update({status:'draft'});
    const allocation=move(active);
    allocation.existingPlans[0].expectedStatus='draft';
    await applyStaffPlanBatch(db,actor,allocation);
    const next=db.collection('routes').doc();
    const driver=db.collection('users').doc();
    await driver.set({role:'driver',name:'Motorista de teste'});
    const order=(await db.collection('orders').where('number','==',item.orderNumber).get()).docs[0];
    assert.equal(order.get('rotaExataRouteId'),null);
    const origin={id:'origin',placeId:'origin',address:'Origem',lat:-16.6,lng:-49.21};
    const dispatch={commandId:randomUUID(),existingPlans:[],serviceLink:{serviceId:service.id,routeIds:[next.id]},
      newRoutes:[{routeId:next.id,plannedStops:[item],data:{status:'dispatched',name:'Nova rota',driverId:driver.id,
        plannedDate:new Date().toISOString(),origin,encodedPolyline:'',distanceMeters:0,duration:'0s'}}]};
    await assert.rejects(applyStaffPlanBatch(db,actor,dispatch),{status:409});
    assert.equal((await next.get()).exists,false);
    assert.equal((await order.ref.get()).get('rotaExataRouteId'),null);
  });
});

test('allocation and replay show the same remaining service pool as a route reload, scoped to readable records',async()=>{
  await withPoolFixture(async ({db,service,active,sibling,item,actor,move})=>{
    const other={id:'service-member',placeId:'service-place',lat:-16.71,lng:-49.21,address:'Outro avulso do serviço'};
    const mirrored={...other,id:'private-mirror',placeId:'another-place'};
    await service.update({allStops:[item,other]});
    await sibling.update({unassignedStops:[item,mirrored]});
    const body=move(active);
    const first=await applyStaffPlanBatch(db,actor,body);
    const replayed=await applyStaffPlanBatch(db,actor,body);
    const loaded=await readStaffEditor(db,{kind:'route',id:active.id});
    assert.deepEqual(first.unassignedStops.map(stop=>stop.id),[other.id,mirrored.id]);
    assert.deepEqual(replayed.unassignedStops.map(stop=>stop.id),first.unassignedStops.map(stop=>stop.id));
    assert.deepEqual(loaded.record.unassignedStops.map(stop=>stop.id),first.unassignedStops.map(stop=>stop.id));

    const restricted={service:()=>false,route:doc=>doc.id===active.id};
    const allowed=await readStaffEditor(db,{kind:'route',id:active.id},undefined,restricted);
    assert.deepEqual(allowed.record.unassignedStops,[]);
    const allowedReplay=await applyStaffPlanBatch(db,actor,body,restricted);
    assert.deepEqual(allowedReplay.unassignedStops,[]);
  });
});
