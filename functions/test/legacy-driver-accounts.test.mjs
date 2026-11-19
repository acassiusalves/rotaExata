import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { blocksLegacyDriverAccountAction,sourceDriverAssignable } from '../lib/legacy-driver-accounts.js';

const phase={mode:'supabase',driverUids:['synthetic-driver']};

test('a fase nativa bloqueia convite de motorista e comandos para a coorte',()=>{
  assert.equal(blocksLegacyDriverAccountAction(phase,{role:'driver'}),true);
  assert.equal(blocksLegacyDriverAccountAction(phase,{uid:'synthetic-driver'}),true);
  assert.equal(blocksLegacyDriverAccountAction(phase,{uid:'synthetic-operator'}),false);
  assert.equal(blocksLegacyDriverAccountAction(phase,{role:'gestor'}),false);
  assert.equal(blocksLegacyDriverAccountAction({mode:'firebase',driverUids:phase.driverUids},{uid:'synthetic-driver'}),false);
  assert.equal(blocksLegacyDriverAccountAction(undefined,{role:'driver'}),false);
  assert.equal(blocksLegacyDriverAccountAction({mode:'supabase'},{uid:'synthetic-driver'}),true);
});

test('os quatro callables compilados recusam a ação após autenticação e antes de efeitos',async()=>{
  const requireCompiled=createRequire(new URL('../lib/index.js',import.meta.url));
  const exports={};
  let effects=0;
  const effect=()=>{effects++;throw new Error('unexpected side effect');};
  let authorizedRole='admin';
  let identity='synthetic-operator';
  const rawRequest={get:()=> 'Bearer synthetic'};
  class HttpsError extends Error { constructor(code,message) {super(message);this.code=code;} }
  const db={
    doc(path) {
      assert.match(path,/^rotaAuthTransition\/(driver|staff)$/);
      return {get:async()=>({data:()=>path.endsWith('/driver') ? phase:undefined})};
    },
    collection(name) {
      assert.equal(name,'users');
      return {doc:()=>({get:async()=>({data:()=>({role:authorizedRole})}),delete:effect,set:effect,update:effect})};
    },
  };
  const register=(_options,handler)=>handler;
  const chained={auth:{user:()=>({onCreate:handler=>handler})},pubsub:{schedule:()=>({onRun:handler=>handler})}};
  const builtins={
    'firebase-functions/v2/https':{onCall:register,HttpsError},
    'firebase-functions/v2/firestore':{onDocumentWritten:register},
    'firebase-functions/v2/scheduler':{onSchedule:register},
    'firebase-functions/params':{defineString:()=>({})},
    'firebase-functions/v1':{region:()=>chained},
    'firebase-admin/app':{initializeApp() {}},
    'firebase-admin/auth':{getAuth:()=>({
      verifyIdToken:async(_token,check)=>{assert.equal(check,true);return {uid:identity,firebase:{sign_in_provider:'password'}};},
      getUserByEmail:effect,createUser:effect,updateUser:effect,deleteUser:effect,revokeRefreshTokens:effect,
    })},
    'firebase-admin/firestore':{getFirestore:()=>db},
    'firebase-admin/messaging':{},
  };
  runInNewContext(readFileSync(new URL('../lib/index.js',import.meta.url),'utf8'),{
    exports,
    require: name=>builtins[name] ?? (name==='./legacy-driver-accounts' || name==='./legacy-staff-cutover' || name.startsWith('node:') ? requireCompiled(name):{}),
  });

  for (const name of ['inviteUser','deleteUser','resetUserPassword','forceLogoutDriver']) {
    const data=name==='inviteUser' ? {email:'synthetic@example.test',role:'driver'}:{uid:'synthetic-driver'};
    await assert.rejects(exports[name]({auth:{uid:'synthetic-operator'},data,rawRequest}),
      {code:'failed-precondition',message:/painel nativo/});
  }
  authorizedRole='driver';
  identity='synthetic-driver';
  await assert.rejects(exports.forceLogoutDriver({auth:{uid:'synthetic-driver'},data:{uid:'synthetic-driver'},rawRequest}),
    {code:'permission-denied'});
  authorizedRole='admin';
  await assert.rejects(exports.deleteUser({auth:{uid:identity},data:{uid:'synthetic-other'},rawRequest}),
    {code:'failed-precondition'});
  assert.equal(effects,0);
});

test('escritores operacionais passam pela verificação de credencial e perfil antes da primeira escrita',async()=>{
  const requireCompiled=createRequire(new URL('../lib/index.js',import.meta.url));
  const exports={};
  class HttpsError extends Error { constructor(code,message) {super(message);this.code=code;} }
  let profile={role:'admin',active:false};
  let door=0;
  let uid='synthetic-operator';
  const register=(_options,handler)=>handler;
  const chain={auth:{user:()=>({onCreate:handler=>handler})},pubsub:{schedule:()=>({onRun:handler=>handler})}};
  const modules={
    'firebase-functions/v2/https':{onCall:register,HttpsError},'firebase-functions/v2/firestore':{onDocumentWritten:register},
    'firebase-functions/v2/scheduler':{onSchedule:register},'firebase-functions/params':{defineString:()=>({})},
    'firebase-functions/v1':{region:()=>chain},'firebase-admin/app':{initializeApp() {}},
    'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async(_t,revoked)=>{assert.equal(revoked,true);return {uid,firebase:{sign_in_provider:'password'}};}})},
    'firebase-admin/firestore':{getFirestore:()=>({
      doc:path=>({get:async()=>({data:()=>path.endsWith('/driver') ? {mode:'supabase',driverUids:['synthetic-cohort']}:undefined})}),
      collection:name=>{if(name!=='users'){door++;throw new Error('arrival at operational store');}
        return {doc:()=>({get:async()=>({data:()=>profile})})};},
    })},
  };
  runInNewContext(readFileSync(new URL('../lib/index.js',import.meta.url),'utf8'),{exports,
    require:name=>modules[name] ?? (name==='./legacy-driver-accounts' || name==='./legacy-staff-cutover' || name.startsWith('node:')?requireCompiled(name):{})});
  const data={routeId:'r',name:'R',driverId:'d',changes:[{changeType:'sequence'}]};
  const request=(actor=uid)=>({auth:{uid:actor},data,rawRequest:{get:()=> 'Bearer synthetic'}});
  for(const name of ['deleteRoute','updateRouteName','updateRouteDriver','duplicateRoute','notifyRouteChanges','completeRoute','resendRouteToDriver','sendCustomNotification','forceCompleteService']){
    await assert.rejects(exports[name](request()),{code:'permission-denied'});
  }
  profile={role:'admin',active:true}; uid='synthetic-cohort';
  await assert.rejects(exports.deleteRoute(request()),{code:'failed-precondition'});
  assert.equal(door,0);
  uid='synthetic-operator';
  await assert.rejects(exports.deleteRoute(request()),/arrival at operational store/);
  assert.equal(door,1);
});


test('a projeção nativa bloqueia operações legadas e permite despacho só quando pronta e sem bloqueio',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const marker={nativeDriverProvisioningId:'synthetic-command'};
  assert.equal(blocksLegacyDriverAccountAction(phase,{uid:id},marker),true);
  assert.equal(blocksLegacyDriverAccountAction({mode:'firebase'},{uid:id},marker),true);
  assert.equal(sourceDriverAssignable(id,undefined),false);
  assert.equal(sourceDriverAssignable(id,marker),false);
  const ready={...marker,role:'driver',nativeDriverReady:true,nativeDriverDispatchEnabled:true};
  assert.equal(sourceDriverAssignable(id,ready),true);
  assert.equal(sourceDriverAssignable(id,{...ready,nativeDriverDispatchEnabled:false}),false);
  assert.equal(sourceDriverAssignable('legacy-source-id',undefined),true);
});
