import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore,Timestamp } from 'firebase-admin/firestore';
import { staffQueryPage } from '../src/lib/server/staff/query-page.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
test('24-row Firestore pages leave no duplicate or missing IDs across timestamp ties',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-fix'},'staff-paging-tie');
  const db=getFirestore(app);
  const collection=db.collection('staffPagingFixture');
  const batch=db.batch();
  const refs=Array.from({length:53},(_,i)=>collection.doc('item-'+String(i).padStart(2,'0')));
  for (const ref of refs) batch.create(ref,{plannedDate:Timestamp.fromMillis(1795100000000)});
  await batch.commit();
  try {
    const pages=[];
    let cursor;
    do {
      const page=await staffQueryPage(collection.select('plannedDate'),cursor,{field:'plannedDate'});
      pages.push(page.docs.map(doc=>doc.id));
      cursor=page.cursor;
    } while(cursor);
    assert.deepEqual(pages.map(page=>page.length),[24,24,5]);
    assert.deepEqual(pages.flat(),refs.map(ref=>ref.id));
  } finally {
    const cleanup=db.batch();
    for (const ref of refs) cleanup.delete(ref);
    await cleanup.commit();
    await deleteApp(app);
  }
});
