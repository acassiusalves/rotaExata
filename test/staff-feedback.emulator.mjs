import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import mod_feedbacks from '../src/lib/server/staff/feedbacks.ts';
const {changeStaffFeedback,listStaffFeedback,readStaffFeedback,submitStaffFeedback}=mod_feedbacks;
import mod_feedback_contract from '../src/lib/staff/feedback-contract.ts';
const {staffFeedbackCommandSchema}=mod_feedback_contract;
import mod_report_server from '../src/lib/reporting/report-server.ts';
const {readReportDetail}=mod_report_server;

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
const app=initializeApp({projectId:'demo-rotaexata-staff-support'},'staff-feedback-test');
const db=getFirestore(app);
const actor={userId:randomUUID(),scopeId:randomUUID(),sourceUid:'source-'+randomUUID(),name:'Operadora',role:'admin'};
const nonce=randomUUID();
const fixture=(origin,uid)=>({originSystem:origin,description:'Chamado '+nonce,user:{uid,name:'Autor'},status:'pending',createdAt:Timestamp.now()});

test('staff reports neither list nor open Lunna or unverified-origin tickets even when legacy admin can open them',async()=>{
  const rota=db.collection('error_reports').doc();
  const luna=db.collection('error_reports').doc();
  const unknown=db.collection('error_reports').doc();
  await Promise.all([rota.set(fixture('rota_exata',actor.sourceUid)),luna.set(fixture('luna',actor.sourceUid)),
    unknown.set({...fixture('unknown',actor.sourceUid),context:{url:'https://rota-exata.vercel.app/admin/erros'}})]);
  const result=await listStaffFeedback(db,actor,{search:nonce});
  assert.deepEqual(result.reports.map(row=>row.id),[rota.id]);
  assert.equal((await readStaffFeedback(db,actor,rota.id)).capabilities.manage,true);
  for (const ref of [luna,unknown]) await assert.rejects(readStaffFeedback(db,actor,ref.id),{status:404});
  assert.equal((await readReportDetail(db,{uid:actor.sourceUid,role:'admin',active:true},luna.id)).originSystem,'luna');
});

test('native submission is idempotent and distinct from a legacy UID with the same spelling',async()=>{
  const input={submissionId:randomUUID(),category:'error',description:'Validar envio '+nonce};
  const saved=await submitStaffFeedback(db,actor,input);
  assert.deepEqual(await submitStaffFeedback(db,actor,input),saved);
  await assert.rejects(submitStaffFeedback(db,actor,{...input,description:'Outro chamado'}),{status:409});
  const data=(await db.doc('error_reports/'+saved.id).get()).data();
  assert.equal(data.user.uid,actor.userId);
  const ours=await readStaffFeedback(db,actor,saved.id);
  assert.equal(ours.capabilities.reopen,true);
  assert.equal((await readStaffFeedback(db,{...actor,userId:randomUUID(),sourceUid:actor.userId},saved.id)).capabilities.reopen,false);
  await assert.rejects(readStaffFeedback(db,{...actor,scopeId:randomUUID()},saved.id),{status:404});
});

test('ticket mutations use CAS and preserve a single resolution notice for the real legacy owner',async()=>{
  const uid='driver-'+nonce;
  await db.doc('users/'+uid).set({role:'driver',active:true});
  const ref=db.collection('error_reports').doc();
  await ref.set({...fixture('rota_exata',uid), internalSecret:'secret'});
  const before=await readStaffFeedback(db,actor,ref.id);
  assert.equal('internalSecret' in before,false);
  const input={reportId:ref.id,revision:before.revision,requestId:randomUUID(),status:'resolved'};
  assert.equal(staffFeedbackCommandSchema.safeParse({...input,userId:uid}).success,false);
  await Promise.all([changeStaffFeedback(db,actor,input),changeStaffFeedback(db,actor,input)]);
  assert.equal((await ref.get()).get('statusHistory').length,1);
  const notices=await db.collection('notifications').where('reportId','==',ref.id).get();
  assert.equal(notices.size,1);
  assert.equal(notices.docs[0].get('driverId'),uid);
  assert.equal(notices.docs[0].get('link'),'/driver/chamados?report='+ref.id);
  await assert.rejects(changeStaffFeedback(db,actor,{...input,status:'in_progress',requestId:randomUUID()}),{status:409});
  const after=await readStaffFeedback(db,actor,ref.id);
  assert.equal(after.statusHistory[0].actor.name,actor.name);
  await assert.rejects(changeStaffFeedback(db,actor,{reportId:ref.id,revision:after.revision,
    requestId:randomUUID(),action:'reopen',details:'Mais informação'}),{status:403});
});

test.after(()=>deleteApp(app));
