import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

import { appPort, source, sourcePort, project, publishableKey, requirePlanningEmulator } from './planning-data.mjs';

requirePlanningEmulator();
const userId = '413d4756-2c7e-4a6c-b75c-624147f954c0';
const sessionId = '0f9476b7-57d2-4829-9c6e-020161e0bb59';
const scopeId = '250e9645-1a90-4bdc-9b38-19f9294685ec';
const profile = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'planner@example.test',
  is_anonymous: false, factors: [], app_metadata: {}, user_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 7200;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({
  sub: userId, session_id: sessionId, iss: source + '/auth/v1', exp: expires, aud: 'authenticated',
  role: 'authenticated', aal: 'aal1',
}) + '.planning-fixture';
const session = { access_token: token, refresh_token: 'planning-fixture', expires_at: expires, expires_in: 7200,
  token_type: 'bearer', user: profile };
const secret = 'sb_secret_planning_fixture';
const identity = {userId,sessionId,scopeId,sourceProject:project,revision:0,policyRevision:0};
const rpc = {
  '/rest/v1/rpc/rota_staff_source_context': { ...identity, authority: 'supabase' },
  '/rest/v1/rpc/rota_staff_resolve_actor': {
    ...identity, role: 'admin', name: 'Operador de teste', application: 'lunna',
    policy: { pagePermissions: {}, inactivePages: [] },
  },
};
const auth = createServer(async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:' + appPort);
  res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Content-Type','application/json');
  const reply = (status,message) => { res.writeHead(status); res.end(JSON.stringify(message)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url === '/auth/v1/user' && req.headers.authorization === 'Bearer ' + token) {
    reply(200,profile); return;
  }
  if (req.method === 'POST' && req.url === '/auth/v1/token?grant_type=password' && req.headers.apikey === publishableKey) {
    reply(200,session); return;
  }
  if (req.method === 'POST' && rpc[req.url] && req.headers.apikey === secret) {
    const body = JSON.parse((await Array.fromAsync(req)).join(''));
    if (body.p_user_id === userId && body.p_session_id === sessionId && body.p_scope_id === scopeId) {
      reply(200,rpc[req.url]); return;
    }
  }
  console.error('[auth fixture] unexpected',req.method,req.url);
  reply(401,{ code: 'fixture_access_denied', msg: 'fixture access denied' });
});
await new Promise((resolve,reject)=>{auth.once('error',reject);auth.listen(sourcePort,'127.0.0.1',resolve);});

const next = spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--turbopack','--hostname','127.0.0.1','-p',String(appPort)],{
  stdio:'inherit',env:{ PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,NEXT_TELEMETRY_DISABLED:'1',
    FIRESTORE_EMULATOR_HOST:process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_PROJECT_ID:project,
    ROTA_EARNINGS_SOURCE_PROJECT:project, ROTA_EARNINGS_SCOPE_ID:scopeId, NEXT_PUBLIC_ROTA_STAFF_AUTH:'supabase',
    NEXT_PUBLIC_SUPABASE_URL:source,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publishableKey,
    SUPABASE_EARNINGS_SECRET_KEY:secret,NEXT_PUBLIC_FIREBASE_PROJECT_ID:project,NEXT_PUBLIC_FIREBASE_API_KEY:'planning-fixture',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'planning-fixture.invalid',NEXT_PUBLIC_FIREBASE_APP_ID:'1:123456789:web:planning',
  },
});
const exit = signal => next.kill(signal);
process.on('SIGTERM',()=>exit('SIGTERM'));
process.on('SIGINT',()=>exit('SIGINT'));
next.on('exit',code=>{auth.close();process.exitCode=code ?? 0;});
