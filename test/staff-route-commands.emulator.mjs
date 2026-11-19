import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { applyStaffRouteCommand, applyStaffServiceClose, staffRouteRevision } from '../src/lib/server/staff/route-commands.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
const app=initializeApp({projectId:'demo-rotaexata-driver'},'staff-route-tests');
const db=getFirestore(app);
const routes=db.collection('routes'), users=db.collection('users');
const actor={userId:'10000000-0000-4000-8000-000000000001',name:'Operador teste',sourceUid:'synthetic-source'};
const counter=db.doc('counters/routeCode');

test('closed route commands respect CAS, dispatch availability and idempotence in the real emulator',async()=>{
  const route=routes.doc();
  const driver=users.doc(randomUUID());
  const service=db.collection('services').doc();
  const receiptIds=[];
  const created=[];
  const counterBefore=await counter.get();
  const command=(kind,revision,extra={})=>{
    const commandId=randomUUID();
    receiptIds.push(commandId);
    return {kind,revision,commandId,...extra};
  };
  try {
    await route.create({name:'Fixture local',code:'RT-FIXTURE',status:'draft',plannedDate:Timestamp.now(),stops:[]});
    await driver.create({role:'driver',name:'Motorista teste',vehicle:{type:'Moto',plate:'ABC1D23'},
      nativeDriverProvisioningId:randomUUID(),nativeDriverReady:true,nativeDriverDispatchEnabled:false});
    const revision=staffRouteRevision((await route.get()).updateTime);
    await assert.rejects(applyStaffRouteCommand(db,actor,route.id,command('assign',revision,{driverId:driver.id})),{status:409});
    assert.equal((await route.get()).data().status,'draft');
    await driver.update({nativeDriverDispatchEnabled:true});
    const assigned=command('assign',revision,{driverId:' '+driver.id+' '});
    await applyStaffRouteCommand(db,actor,route.id,assigned);
    assert.equal((await route.get()).data().driverId,driver.id);
    assert.equal((await route.get()).data().status,'dispatched');
    assert.equal((await applyStaffRouteCommand(db,actor,route.id,assigned)).replayed,true);
    await assert.rejects(applyStaffRouteCommand(db,actor,route.id,{...assigned,driverId:'another'}),{status:409});
    await assert.rejects(applyStaffRouteCommand(db,actor,route.id,command('rename',revision,{name:'Novo nome'})),{status:409});
    const next=staffRouteRevision((await route.get()).updateTime);
    const copy=command('duplicate',next);
    const result=await applyStaffRouteCommand(db,actor,route.id,copy);
    created.push(result.routeId);
    const repeated=await applyStaffRouteCommand(db,actor,route.id,copy);
    assert.equal(repeated.routeId,result.routeId);
    assert.equal(repeated.replayed,true);
    assert.equal(await routes.doc(result.routeId).get().then(s=>s.get('name')),'Fixture local (Cópia)');
    assert.equal((await routes.doc(result.routeId).get()).get('driverId'),driver.id);
    await route.update({serviceId:service.id});
    await assert.rejects(applyStaffRouteCommand(db,actor,route.id,command('delete',staffRouteRevision((await route.get()).updateTime))),{status:409});
    await service.create({status:'dispatched',createdAt:Timestamp.now(),code:'LN-FIXTURE',stats:{totalDeliveries:3}});
    const early=command('force-complete',staffRouteRevision((await service.get()).updateTime));
    await assert.rejects(applyStaffServiceClose(db,actor,service.id,early),{status:409});
    await service.update({createdAt:Timestamp.fromMillis(Date.now()-49*3_600_000)});
    const allowed=command('force-complete',staffRouteRevision((await service.get()).updateTime));
    const closed=await applyStaffServiceClose(db,actor,service.id,allowed);
    assert.equal(closed.completedRoutes,1);
    assert.equal((await route.get()).get('status'),'completed_auto');
    assert.equal((await service.get()).get('stats.completedRoutes'),1);
    assert.equal((await applyStaffServiceClose(db,actor,service.id,allowed)).replayed,true);

  } finally {
    const writes=[route.delete(),driver.delete(),service.delete(), ...created.map(id=>routes.doc(id).delete()),
      ...receiptIds.flatMap(id=>[db.doc('rotaStaffCommands/'+id).delete(),db.doc('activity_log/staff-'+id).delete()])];
    await Promise.all(writes);
    if (counterBefore.exists) await counter.set(counterBefore.data());
    else await counter.delete();
    await deleteApp(app);
  }
});
