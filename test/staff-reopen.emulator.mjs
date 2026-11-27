import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { staffRouteRevision } from '../src/lib/server/staff/route-commands.ts';
import { reopenStaffHistoryRoute } from '../src/lib/server/staff/history-reopen.ts';
import { readStaffRouteHistory } from '../src/lib/server/staff/history.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
const app=initializeApp({projectId:'demo-rotaexata-staff-reopen'},'staff-reopen-tests');
const db=getFirestore(app);
const actor={userId:'10000000-0000-4000-8000-000000000001',sourceUid:'staff-source-test',name:'Operador Local',role:'admin'};
const DAY=24*60*60*1000;
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
const reopenCommand=f=>{
  const id=randomUUID();
  f.ref('rotaStaffHistoryReopens',id);
  f.ref('activity_log','staff-reopen-'+id);
  return id;
};
const revision=async ref=>staffRouteRevision((await ref.get()).updateTime);
const accepted=async()=>({outcome:'accepted',messageId:'fake-msg'});
after(async()=>{await db.terminate();await deleteApp(app);});

test('reopening a driver-completed route keeps its progress, records history and puts the service back in progress',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const route=f.ref('routes');
  const service=f.ref('services');
  const commandId=reopenCommand(f);
  const startedAt=Timestamp.fromMillis(Date.now()-7*DAY);
  const completedAt=Timestamp.fromMillis(Date.now()-7*DAY+60000);
  const stops=[{id:'a',deliveryStatus:'completed',photoUrl:'original',completedAt},{id:'b',deliveryStatus:'pending'}];
  let sent=0;
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      route.set({status:'completed',code:'LN-2000',serviceId:service.id,driverId:driver.id,startedAt,completedAt,
        completedBy:'someone',plannedDate:Timestamp.fromMillis(Date.now()-8*DAY),currentStopIndex:1,stops}),
      service.set({status:'completed',completedAt,stats:{completedRoutes:1,completedDeliveries:1}}),
    ]);
    const selection={routeId:route.id,revision:await revision(route),commandId,reason:'Parada pendente'};
    const result=await reopenStaffHistoryRoute(db,actor,selection,async data=>{
      assert.equal(data.driverId,driver.id);
      sent++;
      return {outcome:'accepted',messageId:'fake-msg'};
    });
    assert.deepEqual({replayed:result.replayed,push:result.push,targetStatus:result.targetStatus,hasPendingPayment:result.hasPendingPayment},
      {replayed:false,push:'accepted',targetStatus:'in_progress',hasPendingPayment:false});
    assert.equal(sent,1);

    const current=await route.get();
    assert.equal(current.get('status'),'in_progress');
    assert.equal(current.get('completedAt'),undefined);
    assert.equal(current.get('autoCompletedAt'),undefined);
    assert.equal(current.get('completedBy'),undefined);
    assert.deepEqual(current.get('startedAt'),startedAt);
    assert.equal(current.get('currentStopIndex'),1);
    assert.deepEqual(current.get('stops'),stops);
    assert.equal(current.get('reopenedBy'),actor.sourceUid);
    assert.equal(current.get('reopenReason'),'Parada pendente');
    assert.equal(current.get('reopenCount'),1);
    assert.ok(current.get('reopenedAt'));
    assert.equal(current.get('staffHistoryReopenId'),commandId);
    const history=current.get('reopenHistory');
    assert.equal(history.length,1);
    assert.equal(history[0].fromStatus,'completed');
    assert.equal(history[0].by,actor.sourceUid);
    assert.equal(history[0].reason,'Parada pendente');
    assert.deepEqual(history[0].previousCompletedAt,completedAt);

    assert.equal((await service.get()).get('status'),'in_progress');
    assert.equal((await service.get()).get('completedAt'),undefined);
    assert.equal((await service.get()).get('stats.completedRoutes'),0);
    const log=await db.collection('activity_log').doc('staff-reopen-'+commandId).get();
    assert.equal(log.get('eventType'),'route_reopened');
    assert.equal(log.get('routeCode'),'LN-2000');
    assert.equal(log.get('canonicalUserId'),actor.userId);
    assert.match(log.get('action'),/Parada pendente/);
    assert.equal((await readStaffRouteHistory(db,driver.id)).routes.length,0);
  } finally {await f.clean();}
});

test('reopening an auto-completed route that never started sends it back as dispatched',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const route=f.ref('routes');
  const commandId=reopenCommand(f);
  const autoCompletedAt=Timestamp.fromMillis(Date.now()-3*DAY);
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      route.set({status:'completed_auto',code:'LN-2001',driverId:driver.id,autoCompletedAt,
        plannedDate:Timestamp.fromMillis(Date.now()-6*DAY),stops:[{id:'a',deliveryStatus:'pending'}]}),
    ]);
    const result=await reopenStaffHistoryRoute(db,actor,
      {routeId:route.id,revision:await revision(route),commandId,reason:'Motorista não abriu o app'},accepted);
    assert.equal(result.targetStatus,'dispatched');
    const current=await route.get();
    assert.equal(current.get('status'),'dispatched');
    assert.equal(current.get('autoCompletedAt'),undefined);
    assert.deepEqual(current.get('reopenHistory')[0].previousAutoCompletedAt,autoCompletedAt);
  } finally {await f.clean();}
});

test('the same command replays without reopening twice and a reused id with other input is a conflict',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const route=f.ref('routes');
  const commandId=reopenCommand(f);
  let sent=0;
  const dispatch=async()=>{sent++;return {outcome:'accepted',messageId:'fake-msg'};};
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      route.set({status:'completed',code:'LN-2002',driverId:driver.id,startedAt:Timestamp.now(),completedAt:Timestamp.now(),
        stops:[{id:'a',deliveryStatus:'completed'}]}),
    ]);
    const selection={routeId:route.id,revision:await revision(route),commandId,reason:'Corrigir finalização'};
    const first=await reopenStaffHistoryRoute(db,actor,selection,dispatch);
    const second=await reopenStaffHistoryRoute(db,actor,selection,dispatch);
    assert.equal(first.replayed,false);
    assert.equal(second.replayed,true);
    assert.equal(second.targetStatus,'in_progress');
    assert.equal(sent,1);
    assert.equal((await route.get()).get('reopenCount'),1);
    assert.equal((await route.get()).get('reopenHistory').length,1);
    await assert.rejects(reopenStaffHistoryRoute(db,actor,{...selection,reason:'Outro motivo qualquer'},dispatch),
      {code:'staff_command_conflict'});
  } finally {await f.clean();}
});

test('a concurrent replay during the push does not send twice and reports an uncertain delivery',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const route=f.ref('routes');
  const commandId=reopenCommand(f);
  let sent=0;
  let pushStarted;
  let releasePush;
  const started=new Promise(resolve=>{pushStarted=resolve;});
  const timeout=new Promise(resolve=>{releasePush=resolve;});
  const dispatch=async()=>{sent++;pushStarted();await timeout;return {outcome:'accepted',messageId:'fake-msg'};};
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      route.set({status:'completed',code:'LN-2003',driverId:driver.id,startedAt:Timestamp.now(),completedAt:Timestamp.now(),
        stops:[{id:'a',deliveryStatus:'completed'}]}),
    ]);
    const selection={routeId:route.id,revision:await revision(route),commandId,reason:'Corrigir finalização'};
    const current=reopenStaffHistoryRoute(db,actor,selection,dispatch);
    assert.equal(await Promise.race([started.then(()=>true),current.then(()=>false)]),true);
    try {
      const concurrent=await reopenStaffHistoryRoute(db,actor,selection,dispatch);
      assert.equal(concurrent.replayed,true);
      assert.equal(concurrent.push,'uncertain');
      assert.equal(sent,1);
    } finally {
      releasePush();
      assert.equal((await current).push,'accepted');
    }
  } finally {await f.clean();}
});

test('a stale revision, a route that is not finished and an unavailable driver are refused without writing',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const inactive=f.ref('users',f.id+'-inactive');
  const stale=f.ref('routes');
  const open=f.ref('routes',f.id+'-open');
  const blocked=f.ref('routes',f.id+'-blocked');
  const orphan=f.ref('routes',f.id+'-orphan');
  const done={status:'completed',startedAt:Timestamp.now(),completedAt:Timestamp.now(),stops:[{id:'a',deliveryStatus:'completed'}]};
  const ids=[reopenCommand(f),reopenCommand(f),reopenCommand(f),reopenCommand(f)];
  const reason='Parada pendente';
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      inactive.set({role:'driver',displayName:'Inativo',active:false}),
      stale.set({...done,code:'LN-2010',driverId:driver.id}),
      open.set({status:'in_progress',code:'LN-2011',driverId:driver.id,stops:[]}),
      blocked.set({...done,code:'LN-2012',driverId:inactive.id}),
      orphan.set({...done,code:'LN-2013'}),
    ]);
    const old=await revision(stale);
    await stale.update({notes:'editada depois da tela carregar'});
    await assert.rejects(reopenStaffHistoryRoute(db,actor,{routeId:stale.id,revision:old,commandId:ids[0],reason},accepted),
      {code:'staff_route_conflict'});
    assert.equal((await stale.get()).get('status'),'completed');
    await assert.rejects(reopenStaffHistoryRoute(db,actor,{routeId:open.id,revision:await revision(open),commandId:ids[1],reason},accepted),
      {code:'staff_route_conflict'});
    await assert.rejects(reopenStaffHistoryRoute(db,actor,{routeId:blocked.id,revision:await revision(blocked),commandId:ids[2],reason},accepted),
      {code:'staff_driver_unavailable'});
    await assert.rejects(reopenStaffHistoryRoute(db,actor,{routeId:orphan.id,revision:await revision(orphan),commandId:ids[3],reason},accepted),
      {code:'staff_driver_unavailable'});
    for (const [ref,status] of [[blocked,'completed'],[orphan,'completed'],[open,'in_progress']]) {
      assert.equal((await ref.get()).get('status'),status);
      assert.equal((await ref.get()).get('reopenCount'),undefined);
    }
    assert.equal((await db.collection('rotaStaffHistoryReopens').doc(ids[0]).get()).exists,false);
  } finally {await f.clean();}
});

test('an approved or paid legacy payment blocks the reopening; a pending one is annotated and a cancelled one ignored',async()=>{
  const f=fixture();
  const driver=f.ref('users');
  const paidRoute=f.ref('routes');
  const pendingRoute=f.ref('routes',f.id+'-pending');
  const paid=f.ref('driverPayments');
  const pending=f.ref('driverPayments',f.id+'-pending');
  const cancelled=f.ref('driverPayments',f.id+'-cancelled');
  const [blockedId,pendingId]=[reopenCommand(f),reopenCommand(f)];
  const done={status:'completed',startedAt:Timestamp.now(),completedAt:Timestamp.now(),driverId:driver.id,
    stops:[{id:'a',deliveryStatus:'completed'}]};
  try {
    await Promise.all([
      driver.set({role:'driver',displayName:'Motorista de teste'}),
      paidRoute.set({...done,code:'LN-2020'}),
      pendingRoute.set({...done,code:'LN-2021'}),
      paid.set({routeId:paidRoute.id,status:'paid',notes:'baixa feita'}),
      pending.set({routeId:pendingRoute.id,status:'pending',notes:'nota anterior'}),
      cancelled.set({routeId:pendingRoute.id,status:'cancelled'}),
    ]);
    await assert.rejects(reopenStaffHistoryRoute(db,actor,
      {routeId:paidRoute.id,revision:await revision(paidRoute),commandId:blockedId,reason:'Parada pendente'},accepted),
    {code:'staff_route_payment_closed'});
    assert.equal((await paidRoute.get()).get('status'),'completed');
    assert.equal((await paid.get()).get('notes'),'baixa feita');

    const result=await reopenStaffHistoryRoute(db,actor,
      {routeId:pendingRoute.id,revision:await revision(pendingRoute),commandId:pendingId,reason:'Parada pendente'},accepted);
    assert.equal(result.hasPendingPayment,true);
    assert.equal((await pendingRoute.get()).get('status'),'in_progress');
    const note=(await pending.get()).get('notes');
    assert.match(note,/^nota anterior\n/);
    assert.match(note,/Rota reaberta em/);
    assert.ok((await pending.get()).get('routeReopenedAt'));
    assert.equal((await cancelled.get()).get('notes'),undefined);
  } finally {await f.clean();}
});
