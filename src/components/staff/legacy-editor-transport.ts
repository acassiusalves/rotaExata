'use client';

import {
  addDoc,collection,deleteDoc,doc,getDoc,getDocFromServer,getDocs,onSnapshot,query,setDoc,updateDoc,where,writeBatch,
  arrayUnion,increment,serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db,functions } from '@/lib/firebase/client';
import { generateRouteCode } from '@/lib/firebase/route-code';
import { carregarOrigemPadrao } from '@/lib/default-origin-client';
import * as plan from '@/lib/firebase/route-stop-mutations';
import * as activity from '@/lib/firebase/activity-log';
import type { EditorRef } from './use-route-editor';
import type { StaffEditorRead } from '@/lib/staff/editor-contract';

const editorCollections={route:'routes',service:'services',order:'orders',location:'locationUpdateRequests'} as const;
export function editorDocument(reference:EditorRef) {
  return doc(db,editorCollections[reference.kind],reference.id);
}
function editorQuery(read:StaffEditorRead) {
  switch(read.kind) {
    case 'route': return doc(db,'routes',read.id);
    case 'service': return doc(db,'services',read.id);
    case 'service-routes': return query(collection(db,'routes'),where('serviceId','==',read.id));
    case 'drivers': return query(collection(db,'users'),where('role','==','driver'));
    case 'active': return query(collection(db,'routes'),where('status','in',['in_progress','dispatched']));
    case 'orders': return query(collection(db,'orders'),where('number',read.numbers.length===1 ? '==' : 'in',
      read.numbers.length===1 ? read.numbers[0]:read.numbers));
    case 'scheduled': {
      const start=new Date(read.date+'T00:00:00-03:00');
      const end=new Date(start.getTime()+24*3_600_000);
      return query(collection(db,'routes'),where('plannedDate','>=',start),where('plannedDate','<',end));
    }
    case 'origin': return doc(db,'settings','defaultOrigin');
  }
}
type Fields=Record<string,any>;
export const legacyEditor={
  read:(reference:EditorRef,server=false)=>(server ? getDocFromServer:getDoc)(editorDocument(reference)),
  select:(read:StaffEditorRead)=>getDocs(editorQuery(read) as ReturnType<typeof query>),
  watch:(read:StaffEditorRead,apply:(data:any)=>void,reject?:(error:Error)=>void)=>
    onSnapshot(editorQuery(read) as ReturnType<typeof query>,apply,reject),
  update:(reference:EditorRef,data:Fields)=>updateDoc(editorDocument(reference),firebaseFields(data)),
  remove:(reference:EditorRef)=>deleteDoc(editorDocument(reference)),
  requestLocation:(id:string)=>setDoc(doc(db,'locationUpdateRequests',id),{driverId:id,requestedAt:serverTimestamp(),status:'pending'}),
  addRoute:(data:Fields)=>addDoc(collection(db,'routes'),firebaseFields(data)),
  addNotification:(data:Fields)=>addDoc(collection(db,'notifications'),firebaseFields(data)),
  batch:(mutations:Array<{reference:EditorRef;data:Fields}>)=>{
    const batch=writeBatch(db);
    for (const {reference,data} of mutations) batch.update(editorDocument(reference),firebaseFields(data));
    return batch.commit();
  },
  plan:(value:Parameters<typeof plan.saveRoutePlanBatchAtomically>[0])=>plan.saveRoutePlanBatchAtomically({
    ...value,existingPlans:value.existingPlans.map(item=>({...item,metadata:item.metadata ? firebaseFields(item.metadata):undefined})),
    newRoutes:value.newRoutes?.map(item=>({...item,data:firebaseFields(item.data)})),
  }),
  call:(name:'notifyRouteChanges'|'updateRouteName',data:unknown)=>httpsCallable(functions,name)(data),
  code:generateRouteCode,origin:carregarOrigemPadrao,activity,
};
function firebaseFields(data:Fields) {
  return Object.fromEntries(Object.entries(data).map(([key,value])=>{
    if (value?.editorMutation==='timestamp') return [key,serverTimestamp()];
    if (value?.editorMutation==='union') return [key,arrayUnion(...value.items)];
    if (value?.editorMutation==='increment') return [key,increment(value.amount)];
    return [key,value];
  }));
}
