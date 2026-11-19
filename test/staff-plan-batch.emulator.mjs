import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore,Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { applyStaffPlanBatch } from '../src/lib/server/staff/route-plan.ts';

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
      service.create({code:'LNS-SYNTHETIC',status:'organizing',routeIds:[],allStops:stops}),
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
