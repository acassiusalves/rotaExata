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

async function cleanup() {
  const serviceId = 'BoQtPJZXkG9jtiE83cPp';
  const serviceDoc = await db.collection('services').doc(serviceId).get();
  const serviceData = serviceDoc.data()!;
  const validRouteIds = new Set(serviceData.routeIds || []);

  console.log('Service LNS-0002 routeIds válidos:', Array.from(validRouteIds));

  // Buscar todas as rotas que referenciam LNS-0002
  const routesSnap = await db.collection('routes').where('serviceId', '==', serviceId).get();

  const orphans: string[] = [];
  for (const routeDoc of routesSnap.docs) {
    const data = routeDoc.data();
    const isValid = validRouteIds.has(routeDoc.id);
    console.log(`\n${data.code || data.name} (${routeDoc.id}): ${isValid ? '✅ VÁLIDA' : '❌ ÓRFÃ'}`);
    console.log(`  stops: ${(data.stops || []).length}`);
    console.log(`  orderNumbers: ${(data.stops || []).map((s: any) => s.orderNumber).join(', ')}`);
    console.log(`  status: ${data.status}`);

    if (!isValid) {
      orphans.push(routeDoc.id);
    }
  }

  if (orphans.length === 0) {
    console.log('\nNenhuma rota órfã encontrada.');
    return;
  }

  console.log(`\nDeletando ${orphans.length} rota(s) órfã(s)...`);
  for (const orphanId of orphans) {
    await db.collection('routes').doc(orphanId).delete();
    console.log(`  ✅ Deletada: ${orphanId}`);
  }

  console.log('\n✅ Cleanup concluído!');
}

cleanup().catch(console.error);
