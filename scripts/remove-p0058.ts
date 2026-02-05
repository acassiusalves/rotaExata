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
  const routeId = 'wl3LNBnMj0LE5WoRwQ0S'; // LNS-0001-D
  const routeDoc = await db.collection('routes').doc(routeId).get();
  const data = routeDoc.data()!;

  const unassigned = data.unassignedStops || [];
  console.log('Antes:', unassigned.length, 'unassignedStops');
  unassigned.forEach((s: any) => console.log('  -', s.orderNumber, s.customerName));

  // Remover P0058 (desvinculado no Luna)
  const cleaned = unassigned.filter((s: any) => s.orderNumber !== 'P0058');

  console.log('\nDepois:', cleaned.length, 'unassignedStops');

  await db.collection('routes').doc(routeId).update({
    unassignedStops: cleaned,
  });

  console.log('\n✅ P0058 removido dos unassignedStops!');
}

cleanup().catch(console.error);
