import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const load=createRequire(import.meta.url)('./support/load-callback.cjs');

test('a autoridade Firebase compartilhada impede chamados da coorte e preserva o operador',async()=>{
  class ReportRequestError extends Error { status:number; constructor(message:string,status:number) {super(message);this.status=status;} }
  let actor={uid:'driver-a',role:'admin'};
  const phase={mode:'supabase',driverUids:['driver-a']};
  const adminDb={doc:()=>({get:async()=>({data:()=>phase})})};
  const {reportRequestContext}=load('src/lib/reporting/report-auth.ts',['reportRequestContext'],{
    nativeDriverEnabled:true,adminDb,ReportRequestError,
    adminAuth:{verifyIdToken:async (_token:string,checkRevoked:boolean)=>assert.equal(checkRevoked,true)},
    authenticateReportActor:async (_request:Request,_db:unknown,verify:(token:string)=>Promise<void>)=>{await verify('synthetic');return actor;},
  });
  for (const method of ['GET','POST','PATCH']) {
    await assert.rejects(reportRequestContext(new Request('http://test.local/api/feedbacks',{method})),{status:403});
  }
  actor={uid:'operator-a',role:'admin'};
  assert.equal((await reportRequestContext(new Request('http://test.local/api/feedbacks'))).actor.uid,actor.uid);
});
