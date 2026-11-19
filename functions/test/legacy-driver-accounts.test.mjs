import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { blocksLegacyDriverAccountAction } from '../lib/legacy-driver-accounts.js';

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
  class HttpsError extends Error { constructor(code,message) {super(message);this.code=code;} }
  const db={
    doc(path) {assert.equal(path,'rotaAuthTransition/driver');return {get:async()=>({data:()=>phase})};},
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
      getUserByEmail:effect,createUser:effect,updateUser:effect,deleteUser:effect,revokeRefreshTokens:effect,
    })},
    'firebase-admin/firestore':{getFirestore:()=>db},
    'firebase-admin/messaging':{},
  };
  runInNewContext(readFileSync(new URL('../lib/index.js',import.meta.url),'utf8'),{
    exports,
    require: name=>builtins[name] ?? (name==='./legacy-driver-accounts' || name.startsWith('node:') ? requireCompiled(name):{}),
  });

  for (const name of ['inviteUser','deleteUser','resetUserPassword','forceLogoutDriver']) {
    const data=name==='inviteUser' ? {email:'synthetic@example.test',role:'driver'}:{uid:'synthetic-driver'};
    await assert.rejects(exports[name]({auth:{uid:'synthetic-operator'},data}),
      {code:'failed-precondition',message:/painel nativo/});
  }
  authorizedRole='driver';
  await assert.rejects(exports.forceLogoutDriver({auth:{uid:'synthetic-driver'},data:{uid:'synthetic-driver'}}),
    {code:'permission-denied'});
  assert.equal(effects,0);
});
