import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash,randomUUID } from 'node:crypto';
import push from '../src/lib/server/staff/push-delivery.ts';
const {publishStaffDriverPush}=push;

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
test('every staff push uses current consent and ownership and records uncertain provider ACK',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-fix'},'staff-push-proof');
  const db=getFirestore(app);
  const uid=randomUUID();
  const token='synthetic-'+uid;
  const profile=db.collection('users').doc(uid);
  const prefs=profile.collection('settings').doc('preferences');
  const owner=db.collection('driverPushTokenBindings').doc(createHash('sha256').update(token).digest('hex'));
  let sends=0;
  let current=true;
  const validator={validateBinding:async()=>false,send:async()=>{sends++;throw new Error('lost ACK');}};
  const input={driverId:uid,build: token=>({token,data:{type:'route_change'}}),stillCurrent:async()=>current};
  try {
    await Promise.all([profile.create({role:'driver',active:true,fcmToken:token}),prefs.create({notifications:false}),owner.create({uid})]);
    assert.equal((await publishStaffDriverPush(db,input,validator)).reason,'consent_missing');
    await prefs.update({notifications:true});
    await owner.update({uid:'other'});
    assert.equal((await publishStaffDriverPush(db,input,validator)).reason,'token_unlinked');
    await owner.update({uid});
    current=false;
    assert.equal((await publishStaffDriverPush(db,input,validator)).reason,'destination_changed');
    assert.equal(sends,0);
    current=true;
    assert.equal((await publishStaffDriverPush(db,input,validator)).delivery.outcome,'uncertain');
    assert.equal(sends,1);
  } finally {
    await Promise.all([profile.delete(),prefs.delete(),owner.delete()]);
    await deleteApp(app);
  }
});
