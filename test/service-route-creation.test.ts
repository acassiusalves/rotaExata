import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { createServiceRoutesAtomically } from '../src/lib/server/driver/service-route-creation.ts';

const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const configs=[{driverId:' '+first+' ',stopIds:['p1']},{driverId:second,stopIds:['p2']}];
const driver={role:'driver',name:'Synthetic',nativeDriverProvisioningId:'synthetic',nativeDriverReady:true,nativeDriverDispatchEnabled:true};

function fixture() {
  const store=new Map<string,Record<string,unknown>>([
    ['services/lab',{code:'LN-LAB',status:'organizing',allStops:[{id:'p1',orderNumber:'1'},{id:'p2',orderNumber:'2'}],origin:{lat:0,lng:0}}],
    ['users/'+first,driver],['users/'+second,driver],['orders/1',{number:'1'}],['orders/2',{number:'2'}],
  ]);
  let route=0;
  type Ref={path:string;id:string;collection:(name:string)=>ReturnType<typeof collection>};
  type Query={order:string};
  function collection(base:string) {
    return {doc:(id=String(++route)):Ref=>({path:base+'/'+id,id,collection:name=>collection(base+'/'+id+'/'+name)}),
      where:(_field:string,_operator:string,order:string)=>({limit:()=>({order})})};
  }
  const db={
    collection,
    async runTransaction<T>(work:(tx:{
      get:(value:Ref|Query)=>Promise<unknown>;create:(ref:Ref,body:Record<string,unknown>)=>void;
      update:(ref:Ref,body:Record<string,unknown>)=>void;
    })=>Promise<T>) {
      const writes:Array<()=>void>=[];
      const get=(ref:Ref)=>({exists:store.has(ref.path),data:()=>store.get(ref.path),ref});
      const result=await work({
        get:async value=>{
          assert.equal(writes.length,0,'all reads must precede the first write');
          return 'path' in value ? get(value) : {docs:[get(collection('orders').doc(value.order))]};
        },
        create:(ref,body)=>writes.push(()=>{assert.equal(store.has(ref.path),false);store.set(ref.path,body);}),
        update:(ref,body)=>writes.push(()=>{store.set(ref.path,{...store.get(ref.path),...body});}),
      });
      writes.forEach(write=>write());
      return result;
    },
  } as unknown as Firestore;
  return {db,store};
}

test('blocked second driver aborts before any route, order or service is written',async()=>{
  const {db,store}=fixture();
  store.set('users/'+second,{...driver,nativeDriverDispatchEnabled:false});
  const before=[...store];
  await assert.rejects(()=>createServiceRoutesAtomically(db,'lab','staff',configs),{name:'Error',message:/motorista/i});
  assert.deepEqual([...store],before);
});

test('normalized UID and all order refs commit together, and replay after lost response creates no routes or logs',async()=>{
  const {db,store}=fixture();
  const a=await createServiceRoutesAtomically(db,'lab','staff',configs);
  assert.equal(a.logs.length,2);
  assert.equal(a.result.routes.length,2);
  const [firstRoute,secondRoute]=a.result.routes.map(item=>item.id);
  assert.deepEqual(store.get('services/lab')?.routeIds,[firstRoute,secondRoute]);
  assert.equal(store.get('routes/'+firstRoute)?.driverId,first);
  assert.equal(store.get('orders/1')?.rotaExataRouteId,firstRoute);
  assert.equal(store.get('orders/2')?.rotaExataRouteId,secondRoute);
  assert.equal(a.result.serviceStatus,'dispatched');
  const before=[...store];
  const replay=await createServiceRoutesAtomically(db,'lab','staff',[{driverId:first,stopIds:['p1']},configs[1]]);
  assert.deepEqual(replay.result,a.result);
  assert.deepEqual(replay.logs,[]);
  assert.deepEqual([...store],before);
});
