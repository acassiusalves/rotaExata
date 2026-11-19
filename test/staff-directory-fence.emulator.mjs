import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import directory from '../src/lib/server/staff/directory.ts';
import routes from '../src/lib/server/staff/route-commands.ts';
const {writeStaffSourceMetadata}=directory;
const {staffRouteRevision}=routes;

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
test('ABA seals a Source command, delayed retry cannot apply, and authorized profile fields preserve email',async()=>{
  const app=initializeApp({projectId:'demo-rotaexata-staff-directory-fix'},'staff-directory-fence');
  const db=getFirestore(app);
  const operator=db.collection('users').doc();
  const target=db.collection('users').doc();
  const scopeId=randomUUID();
  const actor={userId:randomUUID(),scopeId,sourceProject:app.options.projectId,sourceDocumentId:operator.id,
    role:'admin',name:'Operador sintético',policy:{pagePermissions:{},inactivePages:[]},rotaPolicy:{pagePermissions:{},inactivePages:[]}};
  const policy=db.doc('settings/app');
  const command={targetId:randomUUID(),action:'set_role',role:'gestor',revision:0,commandId:randomUUID()};
  const edit={...command,action:'edit_profile',profile:{name:'Nome atualizado',phone:'62999990000'},commandId:randomUUID()};
  const receipt=commandId=>db.collection('rotaStaffRoleReceipts').doc(commandId);
  try {
    await Promise.all([operator.create({role:'admin',active:true}),target.create({role:'socio',displayName:'Antes',email:'test@example.invalid'}),
      policy.set({pagePermissions:{},inactivePages:[]})]);
    const reserved={state:'reserved',sourceProject:actor.sourceProject,sourceDocumentId:target.id,originalActorId:actor.userId,
      expectedRole:'socio',expectedSourceRevision:staffRouteRevision((await target.get()).updateTime)};
    await target.update({role:'admin'});
    await target.update({role:'socio'});
    assert.equal(await writeStaffSourceMetadata(db,actor,reserved,command),'source_conflict');
    assert.equal(await writeStaffSourceMetadata(db,actor,reserved,command),'source_conflict');
    assert.equal((await target.get()).get('role'),'socio');
    assert.equal((await receipt(command.commandId).get()).get('state'),'source_conflict');
    const editReserved={...reserved,expectedSourceRevision:staffRouteRevision((await target.get()).updateTime)};
    assert.equal(await writeStaffSourceMetadata(db,actor,editReserved,edit),'source_applied');
    assert.equal(await writeStaffSourceMetadata(db,actor,editReserved,edit),'source_applied');
    const result=(await target.get()).data();
    assert.equal(result.displayName,edit.profile.name);
    assert.equal(result.phone,edit.profile.phone);
    assert.equal(result.email,'test@example.invalid');
  } finally {
    await Promise.all([operator,target,policy,receipt(command.commandId),receipt(edit.commandId)].map(ref=>ref.delete()));
    await deleteApp(app);
  }
});
