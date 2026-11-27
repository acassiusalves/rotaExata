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
const { geocodedMunicipality,geocodedStopEdit }=await loadModule('../src/lib/geocoded-municipality.ts');

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
  const group=(key,stops)=>({key,name:draft.name,stops,info:metrics});
  async function arrange(ref,routes) {
    return applyStaffEditorCommand(db,actor,{kind:'arrange',routeId:ref.id,commandId:commandId(),
      revision:staffRouteRevision((await ref.get()).updateTime),routes});
  }
  async function dispatch(ref,stops,key='A') {
    const result=routeRef();
    const batch={commandId:commandId(),existingPlans:[],newRoutes:[routeInput(result,stops)],
      draftDispatch:{routeId:ref.id,revision:staffRouteRevision((await ref.get()).updateTime),key}};
    assert.equal(staffPlanBatchSchema.safeParse({...batch,newRoutes:[routeInput(result,[{...stop,isLunnaOrder:true}])]}).success,false);
    const input=staffPlanPayload(batch.commandId,batch);
    await applyStaffPlanBatch(db,actor,input);
    assert.equal((await applyStaffPlanBatch(db,actor,input)).replayed,true);
    return (await result.get()).data();
  }
  async function arrangeAndDispatch(ref,stops=[stop],plannedStops=stops) {
    await arrange(ref,[group('A',stops)]);
    return dispatch(ref,plannedStops);
  }
  async function manualDraft() {
    const created=await createStaffDraft(db,actor,{...draft,commandId:commandId()});
    const ref=routeRef(created.routeId);
    const {id,...fields}=stop;
    const command={kind:'add-manual-stop',routeId:ref.id,commandId:commandId(),
      revision:staffRouteRevision((await ref.get()).updateTime),stop:fields};
    const added=await applyStaffEditorCommand(db,actor,command);
    docs.push(db.doc('rotaStaffCommands/'+added.stop.id));
    return {ref,manual:added.stop};
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
    await t.test('manual stop proof rejects spoofed flags, stale revisions and draft copies',async()=>{
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
    });
    await t.test('Editar Serviço preserves manual origin after notes, optional fields and map address change',async()=>{
      const {ref,manual}=await manualDraft();
      const edited={...manual,notes:'Deixar com a portaria',phone:'',orderNumber:'',
        timeWindowStart:'',timeWindowEnd:'',complemento:'',address:'Outro endereço de teste',
        lat:-16.69,lng:-49.27,city:'Goiânia',state:'GO'};
      const projected=quote(await arrangeAndDispatch(ref,[edited]));
      assert.equal(projected.lunna,false);
      assert.equal(projected.value.totalCents,500);
    });
    await t.test('order hints suppress manual classification on either side of dispatch',async()=>{
      const a=await manualDraft();
      const linked={...a.manual,orderNumber:'SYN-ORDER'};
      assert.equal(quote(await arrangeAndDispatch(a.ref,[linked])).lunna,null);
      const b=await manualDraft();
      await arrange(b.ref,[group('A',[b.manual])]);
      const before=await b.ref.get();
      await b.ref.update({organizedRoutes:[{...before.get('organizedRoutes')[0],
        stops:[{...b.manual,pointCode:'SYN-POINT',lunnaClientCode:'SYN-CLIENT'}]}]});
      assert.equal(quote(await dispatch(b.ref,[{...b.manual,pointCode:'SYN-POINT'}])).lunna,null);
    });
    await t.test('the editor rejects duplicate stop ids before and after dispatching the first group',async()=>{
      const {ref,manual}=await manualDraft();
      const collision={...manual,id:manual.id.toUpperCase(),pointCode:'SYN-DIFFERENT-POINT'};
      await assert.rejects(arrange(ref,[group('A',[manual]),group('B',[collision])]),error=>error.status===409);
      await arrange(ref,[group('A',[manual]),group('B',[stop])]);
      assert.equal(quote(await dispatch(ref,[manual])).lunna,false);
      await assert.rejects(arrange(ref,[group('B',[collision])]),error=>error.status===409);
      assert.equal(quote(await dispatch(ref,[stop],'B')).lunna,false);
    });
    await t.test('the dispatcher rejects duplicate stop ids persisted outside the editor and reuse after first dispatch',async()=>{
      const {ref,manual}=await manualDraft();
      const collision={...manual,pointCode:'SYN-DIFFERENT-POINT'};
      await ref.update({organizedRoutes:[group('A',[manual]),group('B',[collision])]});
      await assert.rejects(dispatch(ref,[manual]),error=>error.status===409);
      await arrange(ref,[group('A',[manual]),group('B',[stop])]);
      assert.equal(quote(await dispatch(ref,[manual])).lunna,false);
      const after=await ref.get();
      await ref.update({organizedRoutes:[after.get('organizedRoutes')[0],group('B',[collision])]});
      await assert.rejects(dispatch(ref,[collision],'B'),error=>error.status===409);
      await ref.update({organizedRoutes:[group('B',[manual])]});
      await assert.rejects(dispatch(ref,[manual],'B'),error=>error.status===409);
    });
    await t.test('a reserved manual id stays unknown in direct plans without its draft',async()=>{
      const {manual}=await manualDraft();
      const result=routeRef();
      await applyStaffPlanBatch(db,actor,{commandId:commandId(),existingPlans:[],newRoutes:[routeInput(result,[manual])]});
      assert.equal(quote((await result.get()).data()).lunna,null);
    });
    await t.test('geocoded municipality survives draft creation and dispatch without assuming an absent UF',async()=>{
      const municipality={types:['administrative_area_level_2','political'],long_name:'Goiânia',short_name:'Goiânia'};
      const locality={types:['locality','political'],long_name:'Localidade de teste',short_name:'Localidade'};
      const state={types:['administrative_area_level_1','political'],long_name:'Goiás',short_name:'GO'};
      assert.deepEqual(geocodedMunicipality([locality,state]),{city:'Localidade de teste',state:'GO'});
      assert.deepEqual(geocodedMunicipality(null),{});
      const {city,state:oldState,...address}=stop;
      for (const [components,expected] of [
        [[municipality,locality,state],{city:'Goiânia',state:'GO'}],
        [[municipality],{city:'Goiânia'}],
      ]) {
        const found=geocodedMunicipality(components);
        assert.deepEqual(found,expected);
        const planned={...address,...found};
        const created=await createStaffDraft(db,actor,{...draft,stops:[planned],commandId:commandId()});
        const projected=quote(await arrangeAndDispatch(routeRef(created.routeId),[planned]));
        assert.equal(projected.lunna,false);
        if (expected.state) assert.equal(projected.value.totalCents,500);
        else assert.deepEqual(projected.value.map(issue=>issue.code),['unmatched_zone']);
      }
    });
    await t.test('the real follow editor payload preserves provenance and handles partial lookup at the same coordinates',async()=>{
      const ref=routeRef();
      const previous={...stop,cidade:'Município anterior',uf:'MG',pointCode:'RT-SYNTHETIC-001',isLunnaOrder:false};
      await ref.create({name:draft.name,status:'dispatched',code:'RT-SYNTHETIC',driverId:driver.id,
        origin,plannedDate:completedAt,...metrics,stops:[previous]});
      const municipality={types:['administrative_area_level_2'],long_name:'Goiânia',short_name:'Goiânia'};
      const state={types:['administrative_area_level_1'],long_name:'Goiás',short_name:'GO'};
      async function saveMapEdit(components,lat,usingSelectedCoordinates=true) {
        const current=(await ref.get()).get('stops')[0];
        const geocoded={address:'Endereço selecionado no mapa',placeId:current.placeId,lat,lng:current.lng,
          ...geocodedMunicipality(components)};
        const planned={...geocodedStopEdit(current,geocoded,usingSelectedCoordinates),
          notes:'Observação da edição',_originalStopKey:getStopIdentityKey(current)};
        const input=staffPlanPayload(commandId(),{existingPlans:[{routeId:ref.id,
          baseStops:[current],plannedStops:[planned]}]});
        await applyStaffPlanBatch(db,actor,input);
        return (await ref.get()).data();
      }
      const corrected=await saveMapEdit([municipality,state],-16.69);
      assert.equal(corrected.stops[0].id,stop.id);
      assert.equal(corrected.stops[0].pointCode,previous.pointCode);
      assert.equal(corrected.stops[0].isLunnaOrder,false);
      assert.equal(corrected.stops[0].cidade,undefined);
      assert.equal(corrected.stops[0].uf,undefined);
      assert.equal(quote(corrected).value.totalCents,500);

      const partial=await saveMapEdit([municipality],-16.69);
      assert.equal(partial.stops[0].state,'GO');
      const noResult=await saveMapEdit(null,-16.69);
      assert.equal(quote(noResult).value.totalCents,500);

      const conflicting=await saveMapEdit([{...municipality,long_name:'Município diferente'}],-16.69);
      assert.equal(conflicting.stops[0].city,'Município diferente');
      assert.equal(conflicting.stops[0].state,undefined);

      await saveMapEdit([municipality,state],-16.69);
      const moved=await saveMapEdit(null,-16.70);
      assert.equal(moved.stops[0].city,undefined);
      assert.equal(moved.stops[0].state,undefined);
      assert.equal(moved.stops[0].isLunnaOrder,false);
      assert.deepEqual(quote(moved).value.map(issue=>issue.code),['unmatched_zone']);

      await saveMapEdit([municipality,state],-16.69);
      const replaced=await saveMapEdit([municipality],-16.69,false);
      assert.equal(replaced.stops[0].state,undefined);
      assert.deepEqual(quote(replaced).value.map(issue=>issue.code),['unmatched_zone']);
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
