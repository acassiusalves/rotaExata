import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials');
  process.exit(1);
}

const apps = getApps();
const adminApp = apps.length === 0
  ? initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    })
  : apps[0];

const db = getFirestore(adminApp);

async function fixDuplicate() {
  // Buscar todas as rotas do serviço LNS-0002
  const routesSnap = await db.collection('routes').where('serviceCode', '==', 'LNS-0002').get();

  console.log(`Encontradas ${routesSnap.size} rotas para LNS-0002\n`);

  const routesWithP0066: { id: string; code: string; stops: any[]; p0066Index: number }[] = [];

  for (const routeDoc of routesSnap.docs) {
    const data = routeDoc.data();
    const stops = data.stops || [];
    const p0066Index = stops.findIndex((s: any) => s.orderNumber === 'P0066');

    console.log(`${data.code || data.name || routeDoc.id} (${routeDoc.id}):`);
    console.log(`  stops: ${stops.length}`);
    console.log(`  orderNumbers: ${stops.map((s: any) => s.orderNumber).join(', ')}`);
    console.log(`  P0066: ${p0066Index >= 0 ? `encontrado no índice ${p0066Index}` : 'NÃO encontrado'}`);

    if (p0066Index >= 0) {
      routesWithP0066.push({ id: routeDoc.id, code: data.code || data.name, stops, p0066Index });
    }
  }

  console.log(`\n${routesWithP0066.length} rota(s) contêm P0066`);

  if (routesWithP0066.length <= 1) {
    console.log('Não há duplicata para corrigir.');
    return;
  }

  // P0066 está em múltiplas rotas - remover da primeira rota (provavelmente a original/fonte)
  // Manter na segunda rota (provavelmente o destino do drag)
  const sourceRoute = routesWithP0066[0]; // Rota 1 (fonte do drag)
  console.log(`\nRemovendo P0066 da rota ${sourceRoute.code} (${sourceRoute.id})...`);

  const cleanedStops = sourceRoute.stops.filter((s: any) => s.orderNumber !== 'P0066');
  console.log(`  Stops antes: ${sourceRoute.stops.length}, depois: ${cleanedStops.length}`);

  await db.collection('routes').doc(sourceRoute.id).update({
    stops: cleanedStops,
  });

  console.log('✅ P0066 removido da rota fonte! Duplicata corrigida.');
}

fixDuplicate().catch(console.error);
