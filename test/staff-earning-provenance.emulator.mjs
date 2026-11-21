import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
async function loadModule(path) {
  const module=await import(path);
  return module.default ?? module;
}
const { createStaffDraft }=await loadModule('../src/lib/server/staff/route-draft.ts');
const { applyStaffEditorCommand }=await loadModule('../src/lib/server/staff/editor-commands.ts');
const { applyStaffPlanBatch }=await loadModule('../src/lib/server/staff/route-plan.ts');
const { applyStaffRouteCommand,staffRouteRevision }=await loadModule('../src/lib/server/staff/route-commands.ts');
const { staffPlanPayload }=await loadModule('../src/lib/staff/editor-payload.ts');
const { staffPlanBatchSchema }=await loadModule('../src/lib/staff/route-plan-contract.ts');
const { routeFacts }=await loadModule('../functions/src/earnings-source-adapter.ts');
const { calculateEarnings,normalizeRouteFacts,normalizeRule }=await loadModule('../src/lib/earnings/domain.ts');
const { getStopIdentityKey }=await loadModule('../src/lib/route-stop-utils.ts');

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');

const actor={userId:randomUUID(),name:'Operador sintético'};
const completedAt='2026-11-20T15:00:00.000Z';
const stop={id:'synthetic-stop',placeId:'synthetic-place',address:'Parada de teste',lat:-16.68,lng:-49.27,city:'Goiânia',state:'GO'};
const origin={...stop,id:'origin',lat:-16.67,lng:-49.26};
const metrics={distanceMeters:3000,duration:'180s',encodedPolyline:''};
const draft={name:'TESTE CONTROLADO',plannedDate:completedAt,routeDate:'',routeTime:'12:00',stops:[stop],origin};
const rule=normalizeRule({mode:'zone',attemptBasisPoints:2000,lunnaCents:100,
  zones:[{cities:[{name:'Goiânia',uf:'GO'}],radiusMeters:7000,priceCents:500}],
  volume:[{minimum:10,cents:500},{minimum:21,cents:1000},{minimum:31,cents:2000}],
});
assert.ok(!Array.isArray(rule));

function quote(data) {
  const source=routeFacts({...data,status:'completed',completedAt,stops:data.stops.map(stop=>({...stop,deliveryStatus:'completed',completedAt}))});
  const facts=normalizeRouteFacts(source);
  assert.ok(!Array.isArray(facts));
  return {lunna:source.stops[0].lunna,value:calculateEarnings(facts,rule)};
}

test('staff planning classifies only stops with dispatch provenance',async t=>{
  const app=initializeApp({projectId:'demo-rotaexata-earning-provenance'},'staff-earning-provenance');
  const db=getFirestore(app);
  const ids=[];
  const docs=[];
  const commandId=()=>{
    const id=randomUUID();
    ids.push(id);
    return id;
  };
  const routeRef=id=>{
    const ref=id ? db.doc('routes/'+id):db.collection('routes').doc();
    docs.push(ref);
    return ref;
  };
  const driver=db.collection('users').doc();
  docs.push(driver);
  await driver.create({role:'driver',active:true,displayName:'Motorista sintético'});
  const routeInput=(ref,plannedStops)=>({routeId:ref.id,plannedStops,data:{
    name:draft.name,origin,status:'dispatched',driverId:driver.id,plannedDate:completedAt,...metrics,
  }});
  async function arrangeAndDispatch(ref,stops=[stop],plannedStops=stops) {
    await applyStaffEditorCommand(db,actor,{kind:'arrange',routeId:ref.id,commandId:commandId(),
      revision:staffRouteRevision((await ref.get()).updateTime),
      routes:[{key:'A',name:draft.name,stops,info:metrics}],
    });
    const result=routeRef();
    const batch={commandId:commandId(),existingPlans:[],newRoutes:[routeInput(result,plannedStops)],
      draftDispatch:{routeId:ref.id,revision:staffRouteRevision((await ref.get()).updateTime),key:'A'}};
    assert.equal(staffPlanBatchSchema.safeParse({...batch,newRoutes:[routeInput(result,[{...stop,isLunnaOrder:true}])]}).success,false);
    await applyStaffPlanBatch(db,actor,staffPlanPayload(batch.commandId,batch));
    return (await result.get()).data();
  }
  try {
    await t.test('a BFF draft remains provable after an edit and prices the standalone stop at 500 cents',async()=>{
      const created=await createStaffDraft(db,actor,{...draft,commandId:commandId()});
      const result=await arrangeAndDispatch(routeRef(created.routeId));
      const projected=quote(result);
      assert.equal(projected.lunna,false);
      assert.equal(projected.value.totalCents,500);
    });
    await t.test('a directly created standalone plan classifies a new stop without an order',async()=>{
      const result=routeRef();
      await applyStaffPlanBatch(db,actor,{commandId:commandId(),existingPlans:[],newRoutes:[routeInput(result,[stop])]});
      const projected=quote((await result.get()).data());
      assert.equal(projected.lunna,false);
      assert.equal(projected.value.totalCents,500);
      const unlinked=routeRef();
      await applyStaffPlanBatch(db,actor,{commandId:commandId(),existingPlans:[],
        newRoutes:[routeInput(unlinked,[{...stop,orderNumber:'SYN-UNPROVEN'}])]});
      assert.equal(quote((await unlinked.get()).data()).lunna,null);
    });
    await t.test('a legacy draft and a BFF duplicate of legacy data preserve the unknown classification',async()=>{
      const legacy=routeRef();
      await legacy.create({...draft,source:'rota-exata',status:'draft'});
      const copied=await applyStaffRouteCommand(db,actor,legacy.id,{kind:'duplicate',commandId:commandId(),
        revision:staffRouteRevision((await legacy.get()).updateTime)});
      for (const ref of [legacy,routeRef(copied.routeId)]) {
        const projected=quote(await arrangeAndDispatch(ref));
        assert.equal(projected.lunna,null);
        assert.deepEqual(projected.value.map(issue=>issue.code),['unknown_lunna_classification']);
      }
    });
    await t.test('a recreated draft cannot inherit provenance from its older receipt',async()=>{
      const created=await createStaffDraft(db,actor,{...draft,commandId:commandId()});
      const ref=routeRef(created.routeId);
      const stored=(await ref.get()).data();
      await ref.delete();
      await ref.create(stored);
      assert.equal(quote(await arrangeAndDispatch(ref)).lunna,null);
    });
    await t.test('a transferred legacy stop retains its unknown classification',async()=>{
      const legacy=routeRef();
      const target=routeRef();
      await legacy.create({status:'dispatched',driverId:driver.id,stops:[stop],source:'rota-exata'});
      const result=await applyStaffPlanBatch(db,actor,{commandId:commandId(),
        existingPlans:[{routeId:legacy.id,baseStops:[{id:stop.id}],plannedStops:[]}],
        newRoutes:[routeInput(target,[{...stop,_originalStopKey:' '+getStopIdentityKey(stop)+' '}])],
        transferIntents:[{sourceRouteId:legacy.id,targetRouteId:target.id,stopKey:getStopIdentityKey(stop)}],
      });
      docs.push(db.doc('routeChangeNotifications/'+legacy.id));
      if (result.existingRoutes[0].noticeId) docs.push(db.doc('rotaStaffRouteNotices/'+result.existingRoutes[0].noticeId));
      assert.equal(quote((await target.get()).data()).lunna,null);
    });
    await t.test('a removed stop added to a new route without a transfer intent keeps its unknown classification',async()=>{
      const legacy=routeRef();
      const target=routeRef();
      await legacy.create({status:'dispatched',driverId:driver.id,stops:[stop],source:'rota-exata'});
      const result=await applyStaffPlanBatch(db,actor,{commandId:commandId(),
        existingPlans:[{routeId:legacy.id,baseStops:[{id:stop.id}],plannedStops:[]}],
        newRoutes:[routeInput(target,[stop])],
      });
      docs.push(db.doc('routeChangeNotifications/'+legacy.id));
      if (result.existingRoutes[0].noticeId) docs.push(db.doc('rotaStaffRouteNotices/'+result.existingRoutes[0].noticeId));
      assert.equal(quote((await target.get()).data()).lunna,null);
    });
    await t.test('Adicionar Serviço issues a private receipt for the new stop saved only in organizedRoutes',async()=>{
      const created=await createStaffDraft(db,actor,{...draft,commandId:commandId()});
      const ref=routeRef(created.routeId);
      const {id,...manual}=stop;
      const command={kind:'add-manual-stop',routeId:ref.id,commandId:commandId(),
        revision:staffRouteRevision((await ref.get()).updateTime),stop:manual};
      const added=await applyStaffEditorCommand(db,actor,command);
      docs.push(db.doc('rotaStaffCommands/'+added.stop.id));
      assert.notEqual(added.stop.id,id);
      assert.deepEqual((await applyStaffEditorCommand(db,actor,command)).stop,added.stop);
      assert.equal((await ref.get()).get('stops')[0].id,id);
      const projected=quote(await arrangeAndDispatch(ref,[added.stop]));
      assert.equal(projected.lunna,false);
      assert.equal(projected.value.totalCents,500);
    });
    await t.test('manual stop proof rejects spoofed flags, stale revisions, modified points and draft copies',async()=>{
      const created=await createStaffDraft(db,actor,{...draft,commandId:commandId()});
      const ref=routeRef(created.routeId);
      const {id,...manual}=stop;
      const command={kind:'add-manual-stop',routeId:ref.id,commandId:commandId(),
        revision:staffRouteRevision((await ref.get()).updateTime),stop:manual};
      await assert.rejects(applyStaffEditorCommand(db,actor,{...command,stop:{...manual,id,isLunnaOrder:false}}),
        error=>error.name==='ZodError');
      await assert.rejects(applyStaffEditorCommand(db,actor,{...command,revision:'000000000001.000000000'}),
        error=>error.code==='staff_route_conflict');
      const added=await applyStaffEditorCommand(db,actor,command);
      docs.push(db.doc('rotaStaffCommands/'+added.stop.id));
      const copy=await createStaffDraft(db,actor,{...draft,commandId:commandId()});
      assert.equal(quote(await arrangeAndDispatch(routeRef(copy.routeId),[added.stop])).lunna,null);
      assert.equal(quote(await arrangeAndDispatch(ref,[added.stop],[{...added.stop,notes:'Conteúdo diferente'}])).lunna,null);
    });
    async function serviceDispatch(linkedFacts,existing) {
      const service=db.collection('services').doc();
      const order=db.collection('orders').doc();
      const route=routeRef();
      const linked={...stop,orderNumber:'SYN-'+order.id};
      const archived={...stop,id:'archived-stop',unlinkedAt:completedAt};
      docs.push(service,order);
      await service.create({code:'LNS-SYNTHETIC',status:'organizing',routeIds:existing ? [route.id]:[],
        allStops:[{...linked,...linkedFacts}]});
      await order.create({number:linked.orderNumber,rotaExataServiceId:service.id});
      if (existing) await route.create({name:draft.name,origin,plannedDate:completedAt,
        status:'draft',stops:[{...linked,...linkedFacts},archived],serviceId:service.id,code:'LNS-SYNTHETIC-A',...metrics});
      const input={commandId:commandId(),
        existingPlans:existing ? [{routeId:route.id,expectedStatus:'draft',baseStops:[{id:linked.id,orderNumber:linked.orderNumber}],plannedStops:[linked],
          metadata:{status:'dispatched',driverId:driver.id}}]:[],
        ...(existing ? {}:{newRoutes:[routeInput(route,[linked])],serviceLink:{serviceId:service.id,routeIds:[route.id]}})};
      assert.equal(staffPlanBatchSchema.safeParse({...input,newRoutes:[routeInput(route,[{...linked,isLunnaOrder:false}])]}).success,false);
      await applyStaffPlanBatch(db,actor,input);
      assert.equal((await order.get()).get('rotaExataRouteId'),route.id);
      return {result:(await route.get()).data(),archived};
    }
    await t.test('dispatching a saved service draft preserves archived stops and its linked orders',async()=>{
      const {result,archived}=await serviceDispatch({},true);
      assert.deepEqual(result.stops.find(row=>row.id===archived.id),archived);
    });
    await t.test('an operational link alone does not attest the Lunna bonus',async()=>{
      const {result}=await serviceDispatch({},false);
      assert.equal(quote(result).lunna,null);
    });
    await t.test('a linked stop with existing commercial facts preserves the Lunna bonus',async()=>{
      const {result}=await serviceDispatch({lunnaClientCode:'SYN-CLIENT'},false);
      assert.equal(result.stops[0].isLunnaOrder,undefined);
      const projected=quote(result);
      assert.equal(projected.lunna,true);
      assert.equal(projected.value.totalCents,600);
    });
  } finally {
    const events=await db.collection('activity_log').get();
    await Promise.all([...docs,db.doc('counters/routeCode'),...ids.map(id=>db.doc('rotaStaffCommands/'+id)),
      ...events.docs.filter(doc=>doc.id.startsWith('staff-') && ids.some(id=>doc.id.startsWith('staff-'+id))).map(doc=>doc.ref)
    ].map(ref=>ref.delete()));
    await deleteApp(app);
  }
});
