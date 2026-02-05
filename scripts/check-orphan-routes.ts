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
  // Verificar rotas específicas
  const ids = ['88ANgv7LsotD6nA4ex7s', 'VBX6vXPfcfExmy9wy4G1'];

  for (const id of ids) {
    const doc = await db.collection('routes').doc(id).get();
    if (!doc.exists) {
      console.log(`${id}: NÃO EXISTE`);
      continue;
    }
    const data = doc.data()!;
    console.log(`${data.code || data.name} (${id}):`);
    console.log(`  serviceId: ${data.serviceId || 'N/A'}`);
    console.log(`  serviceCode: ${data.serviceCode || 'N/A'}`);
    console.log(`  status: ${data.status}`);
    console.log(`  stops: ${(data.stops || []).length}`);
    console.log(`  orderNumbers: ${(data.stops || []).map((s: any) => s.orderNumber).join(', ')}`);
    console.log(`  createdAt: ${data.createdAt?.toDate?.() || 'N/A'}`);
    console.log();
  }
}

check().catch(console.error);
