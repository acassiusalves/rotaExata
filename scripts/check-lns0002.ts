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

async function check() {
  // Todos os serviços
  console.log('=== TODOS OS SERVICOS ===');
  const servicesSnap = await db.collection('services').get();
  for (const d of servicesSnap.docs) {
    const data = d.data();
    console.log(`\n${data.code} (ID: ${d.id})`);
    console.log(`  status: ${data.status}`);
    console.log(`  allStops: ${(data.allStops || []).length}`);
    console.log(`  routeIds: ${JSON.stringify(data.routeIds || [])}`);
    console.log(`  createdAt: ${data.createdAt?.toDate?.() || 'N/A'}`);
  }

  // Todas as rotas
  console.log('\n\n=== TODAS AS ROTAS ===');
  const routesSnap = await db.collection('routes').get();
  for (const d of routesSnap.docs) {
    const data = d.data();
    console.log(`\n${data.code || data.name || '(sem código)'} (ID: ${d.id})`);
    console.log(`  serviceId: ${data.serviceId || 'nenhum'}`);
    console.log(`  status: ${data.status}`);
    console.log(`  stops: ${(data.stops || []).length} | orderNumbers: ${(data.stops || []).map((s: any) => s.orderNumber).join(', ')}`);
    console.log(`  unassignedStops: ${(data.unassignedStops || []).length}`);
    console.log(`  driverId: ${data.driverId || 'nenhum'}`);
    console.log(`  createdAt: ${data.createdAt?.toDate?.() || 'N/A'}`);
  }
}

check().catch(console.error);
