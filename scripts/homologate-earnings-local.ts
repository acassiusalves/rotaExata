import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeEnvelope } from '../functions/src/earnings-source-adapter.ts';
import { issueRouteEarnings, receiveEarningsEvent } from '../src/lib/server/earnings/issuance.ts';
import { currentCompetence } from '../src/lib/driver-statement.ts';
import { earningsSupabaseUrl } from '../src/lib/server/earnings/transport.ts';

type Fixture = { scopeId: string; sourceProject: string; users: { kind: string; id: string; email: string; password: string; legacySubject: string }[] };
async function observe(client: SupabaseClient,target: string,onChange: (payload: { new: object }) => void) {
  const channel = client.channel('homolog-' + randomUUID()).on('postgres_changes',{
    event:'*',schema:'public',table:'driver_earning_statement',filter:'driver_id=eq.' + target,
  },onChange);
  await new Promise<void>((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')),12000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error('Realtime unavailable')); }
    });
  });
}

async function main() {
  assert.equal(earningsSupabaseUrl(),'http://127.0.0.1:61421');
  assert.equal(process.env.NEXT_PUBLIC_ROTA_DRIVER_AUTH,'supabase');
  assert.equal(process.env.ROTA_EARNINGS_SOURCE_PROJECT,'demo-rotaexata-driver');
  assert.equal(process.env.FIREBASE_PROJECT_ID,'demo-rotaexata-driver');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9198');
  assert.ok(!process.env.FIREBASE_PRIVATE_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS,'Only emulator configuration is allowed');
  const fixture: Fixture = JSON.parse(await readFile(process.argv[2],'utf8'));
  assert.equal(fixture.sourceProject,process.env.FIREBASE_PROJECT_ID);
  assert.equal(fixture.scopeId,process.env.ROTA_EARNINGS_SCOPE_ID);
  assert.equal(fixture.users.length,3);
  assert.ok(fixture.users.every(user => user.email.endsWith('.test')));

  const { adminDb } = await import('../src/lib/firebase/admin.ts');
  assert.ok(adminDb,'Firestore emulator is required');
  const native = await import('../src/app/api/driver/routes/route.ts');
  const runtime=await import('../src/app/api/driver/runtime/route.ts');
  const photos=await import('../src/app/api/driver/media/[id]/route.ts');
  const pushes=await import('../src/app/api/driver/push-delivery/route.ts');
  const payment = await import('../src/app/api/financeiro/pagamentos/route.ts');
  const statement = await import('../src/app/api/driver/earnings/route.ts');
  const rules = await import('../src/app/api/financeiro/regras/route.ts');

  const clients = await Promise.all(fixture.users.map(async user => {
    const client = createClient(earningsSupabaseUrl(),process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
      auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false }, realtime:{ heartbeatIntervalMs:5000 },
    });
    const result = await client.auth.signInWithPassword({ email:user.email,password:user.password });
    assert.ok(!result.error && result.data.session,'Native Supabase session');
    assert.equal(result.data.session.user.id,user.id);
    await client.realtime.setAuth(result.data.session.access_token);
    return { ...user,client,token:result.data.session.access_token };
  }));
  const operator = clients.find(user => user.kind === 'admin');
  const drivers = clients.filter(user => user.kind !== 'admin');
  assert.ok(operator && drivers.length===2,'An admin and two drivers required');
  const [driver,other] = drivers;
  const req = (path: string,token: string,method='GET',body?: unknown) => new Request('http://127.0.0.1:61420'+path,{
    method,headers:{ Authorization:'Bearer '+token, ...(body ? { 'Content-Type':'application/json' } : {}) },body:body ? JSON.stringify(body) : undefined,
  });
  let stage = 'rule';
  try {
    const active = await rules.GET(req('/api/financeiro/regras',operator.token));
    assert.equal(active.status,200);
    assert.equal((await active.json()).rule?.definition?.mode,'distance','Publish a distance rule in the local admin UI first');

    stage = 'source';
    const routeId = 'homolog-native-' + randomUUID();
    const ref = adminDb.collection('routes').doc(routeId);
    await Promise.all(drivers.map(user => adminDb.collection('users').doc(user.legacySubject).set({ role:'driver',active:true,totalDeliveries:0 })));
    await ref.set({
      driverId:driver.legacySubject,status:'dispatched', plannedDate:new Date(), distanceMeters:12500,
      origin:{lat:0,lng:0},stops:[
        {id:'fixture-1',lat:0,lng:0,city:'Goiânia',state:'GO',isLunnaOrder:false},
        {id:'fixture-moved',lat:1,lng:1,unlinkedAt:new Date()},
      ],
    });
    assert.equal((await native.GET(req('/api/driver/routes?id='+routeId,driver.token))).status,200);
    assert.equal((await native.GET(req('/api/driver/routes?id='+routeId,other.token))).status,404);
    const mutate = (token: string,action: string,extra={}) => native.POST(req('/api/driver/routes',token,'POST',{routeId,action,...extra}));
    assert.equal((await mutate(other.token,'start')).status,403);
    assert.equal((await mutate(driver.token,'start')).status,200);
    assert.equal((await mutate(driver.token,'finish')).status,409);
    const view=await (await native.GET(req('/api/driver/routes?id='+routeId,driver.token))).json();
    assert.deepEqual(view.route.stops.map((stop:{id:string})=>stop.id),['fixture-1']);
    const attempt={
      requestId:randomUUID(),expectedRevision:view.route.stops[0].driverRevision,targetStop:{id:'fixture-1'},
      patch:{deliveryStatus:'completed',notes:null,failureReason:null,wentToLocation:null,payments:[],deliveredItemIds:[],photoUrl:null,attemptPhotoUrl:null},
    };
    assert.equal((await mutate(driver.token,'confirm',attempt)).status,422);
    const upload=await runtime.POST(req('/api/driver/runtime',driver.token,'POST',{
      kind:'upload',routeId,targetStop:{id:'fixture-1'},mediaKind:'delivery',
      data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXe8AAAAASUVORK5CYII=',
    }));
    assert.equal(upload.status,200);
    const receipt=await upload.json();
    assert.match(receipt.url,/^\/api\/driver\/media\/[a-f0-9-]+$/);
    const confirmation={...attempt,patch:{...attempt.patch,photoUrl:receipt.url},media:{delivery:receipt.id}};
    const confirmed=await mutate(driver.token,'confirm',confirmation);
    assert.equal(confirmed.status,200);
    const firstResponse=await confirmed.json();
    const retransmit=await mutate(driver.token,'confirm',confirmation);
    assert.deepEqual(await retransmit.json(),firstResponse);
    assert.equal((await mutate(driver.token,'confirm',{...confirmation,requestId:randomUUID()})).status,409);
    assert.equal((await mutate(driver.token,'confirm',{...confirmation,patch:{...confirmation.patch,notes:'conflict'}})).status,409);
    assert.equal((await mutate(driver.token,'confirm',{...confirmation,requestId:randomUUID(),targetStop:{id:'fixture-moved'}})).status,409);
    const activity=await adminDb.collection('activity_log').where('routeId','==',routeId).get();
    assert.equal(activity.size,1,'Duplicate confirmations must not add an activity');
    const getPhoto=(token:string)=>photos.GET(req(receipt.url,token),{params:Promise.resolve({id:receipt.id})});
    const ownPhoto=await getPhoto(driver.token);
    assert.equal(ownPhoto.status,200);
    assert.match((await ownPhoto.json()).src,/^data:image\/png;base64,/);
    assert.equal((await getPhoto(other.token)).status,404);
    assert.equal((await mutate(driver.token,'finish')).status,200);

    stage = 'realtime';
    let received = 0;
    let denied = 0;
    await Promise.all([
      observe(driver.client,driver.id,payload => { if (Object.keys(payload.new).length) received++; }),
      observe(other.client,driver.id,payload => { if (Object.keys(payload.new).length) denied++; }),
    ]);

    stage = 'inbox';
    const route = await ref.get();
    const evidence = (await adminDb.collection('rotaEarningRouteEvidence').doc(routeId).get()).data()?.completion;
    assert.ok(evidence,'A completed route has a private server proof');
    const envelope = makeEnvelope(fixture.sourceProject,routeId,route.updateTime!,'snapshot',{...route.data(),earningsSourceCompletion:evidence});
    assert.equal(envelope.facts.evidence,'driver-server-v1');
    assert.equal((await receiveEarningsEvent(envelope,fixture.sourceProject)).status,'received');
    assert.equal((await receiveEarningsEvent(envelope,fixture.sourceProject)).status,'duplicate');
    assert.equal(await issueRouteEarnings(fixture.scopeId),'processed');

    const month = currentCompetence(new Date(envelope.facts.workedAt!));
    const window = req('/api/driver/earnings?month='+month,driver.token);
    const statementRead = await statement.GET(window);
    assert.equal(statementRead.status,200);
    const panel = await payment.GET(req('/api/financeiro/pagamentos?month='+month,operator.token));
    const result = (await panel.json()).rows.find((row: { logical_route_id: string }) => row.logical_route_id===routeId);
    assert.equal(result.status,'pending');
    assert.ok((await statementRead.json()).rows.some((row: { id: string; total_cents: number; status: string }) =>
      row.id===result.id && row.total_cents===result.total_cents && row.status==='pending'));

    stage = 'commands';
    const command = (token: string,kind: string,rev: number,payload: unknown) => payment.PATCH(req('/api/financeiro/pagamentos',token,'PATCH',{
      paymentId:result.id,expectedRevision:rev,requestId:randomUUID(),kind,payload,
    }));
    assert.equal((await command(driver.token,'approve',1,{})).status,403);
    assert.equal((await command(operator.token,'approve',1,{})).status,200);
    assert.equal((await command(operator.token,'pay',2,{ method:'pix',reference:'homologacao-local' })).status,200);
    assert.equal((await command(operator.token,'cancel',2,{ reason:'Corrida simulada' })).status,409);

    stage = 'isolation';
    const [visible, invisible] = await Promise.all([driver,other].map(user =>
      user.client.from('driver_earning_statement').select('id,status,total_cents,revision').eq('id',result.id)));
    assert.ok(!visible.error && !invisible.error);
    assert.equal(visible.data?.[0]?.status,'paid');
    assert.equal(visible.data?.[0]?.revision,3);
    assert.equal(visible.data?.[0]?.total_cents,result.total_cents);
    assert.equal(invisible.data?.length,0);
    const deadline=Date.now()+10000;
    while (received<3 && Date.now()<deadline) await new Promise(resolve => setTimeout(resolve,150));
    assert.ok(received>=3,`Own Realtime INSERT and UPDATE events (own: ${received}, other: ${denied})`);
    assert.equal(denied,0,'Other driver receipts invisible in Realtime');
    stage='push session and media revocation';
    const prefs=await (await runtime.GET(req('/api/driver/runtime?resource=preferences',driver.token))).json();
    const bind=await runtime.POST(req('/api/driver/runtime',driver.token,'POST',{kind:'push-bind',
      token:'synthetic_'+randomUUID(),explicit:true,preferenceRevision:prefs.pushRevision,
    }));
    assert.equal(bind.status,200);
    const grant=(await bind.json()).grant;
    const validate=()=>pushes.POST(req('/api/driver/push-delivery',driver.token,'POST',{bindingId:grant.id,proof:grant.proof}));
    assert.equal((await validate()).status,200);
    const revoked=await driver.client.auth.signOut({scope:'local'});
    assert.equal(revoked.error,null);
    assert.equal((await getPhoto(driver.token)).status,401);
    assert.equal((await validate()).status,404);
    console.log(JSON.stringify({ receiptProtected:true,idempotentConfirmation:true,detachedExcluded:true,boundPushRevoked:true,start:true,confirm:true,finish:true,proof:true,exactCents:result.total_cents,statuses:['pending','approved','paid'],
      pendingOnce:true,otherDriverRestRows:invisible.data?.length,ownRealtimeEvents:received,otherRealtimeEvents:denied }));
  } catch (error) {
    console.error('Homologação local falhou na etapa',stage,error instanceof Error ? error.message : 'erro');
    process.exitCode=1;
  } finally {
    await Promise.all(clients.map(async user => { await user.client.removeAllChannels(); await user.client.auth.signOut({scope:'local'}); }));
  }
}
main().catch(() => { console.error('O ambiente local de homologação não foi configurado.'); process.exitCode=1; });
