import { after } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { drainEarningsQueue, receiveEarningsEvent } from '@/lib/server/earnings/issuance';
import { EarningsError, earningsErrorResponse, earningsRpc, readJsonBody } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
export const maxDuration = 60;
const verifier = new OAuth2Client();

async function verifyBridge(request: Request) {
  const audience = process.env.ROTA_EARNINGS_EVENTS_URL;
  const sourceProject = process.env.ROTA_EARNINGS_SOURCE_PROJECT;
  const email = process.env.ROTA_EARNINGS_BRIDGE_EMAIL;
  const subject = process.env.ROTA_EARNINGS_BRIDGE_SUBJECT;
  if (!audience || !sourceProject || !email || !subject) throw new EarningsError(503, 'earnings_capture_unavailable');
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 16384) throw new EarningsError(401, 'earnings_unauthorized');
  try {
    const payload = (await verifier.verifyIdToken({ idToken: token, audience })).getPayload();
    if (payload?.sub === subject && payload.email === email && payload.email_verified &&
        ['accounts.google.com','https://accounts.google.com'].includes(payload.iss)) return sourceProject;
  } catch { /* malformed or unverifiable credential */ }
  throw new EarningsError(401, 'earnings_unauthorized');
}

export async function GET(request: Request) {
  try {
    const sourceProject = await verifyBridge(request);
    const scope = process.env.ROTA_EARNINGS_SCOPE_ID;
    if (!scope || !await earningsRpc<boolean>('rota_earnings_bridge_ready',{
      p_scope_id:scope,p_source_project:sourceProject,
    })) throw new EarningsError(503,'earnings_capture_unavailable');
    return Response.json({ ready:true, sourceProject }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) { return earningsErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const source = await verifyBridge(request);
    const result = await receiveEarningsEvent(await readJsonBody(request, 600000), source);
    after(async () => {
      try { await drainEarningsQueue(2); }
      catch { console.error('Earnings immediate processing unavailable'); }
    });
    return Response.json(result, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return earningsErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await verifyBridge(request);
    return Response.json({ processed: await drainEarningsQueue(6) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return earningsErrorResponse(error);
  }
}
