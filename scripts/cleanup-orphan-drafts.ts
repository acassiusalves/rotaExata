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
  const routesSnap = await db.collection('routes').get();
  const toDelete: { id: string; code: string; status: string; stops: string[] }[] = [];

  for (const doc of routesSnap.docs) {
    const data = doc.data();
    const status = data.status;
    const serviceId = data.serviceId;
    const stops = (data.stops || []) as any[];
    const orderNumbers = stops.map((s: any) => s.orderNumber).filter(Boolean);

    // Critério: draft ou pending, SEM serviceId, com pedidos P0xxx
    if (
      (status === 'draft' || status === 'pending') &&
      !serviceId &&
      orderNumbers.some((on: string) => /^P\d+$/.test(on))
    ) {
      toDelete.push({
        id: doc.id,
        code: data.code || data.name || '(sem código)',
        status,
        stops: orderNumbers,
      });
    }
  }

  console.log(`\n=== RASCUNHOS ÓRFÃOS ENCONTRADOS: ${toDelete.length} ===\n`);
  for (const r of toDelete) {
    console.log(`  ${r.code} (${r.id}) | ${r.status} | stops: ${r.stops.join(', ')}`);
  }

  if (toDelete.length === 0) {
    console.log('Nenhum rascunho órfão para remover.');
    return;
  }

  console.log(`\nRemovendo ${toDelete.length} rascunhos...`);
  for (const r of toDelete) {
    await db.collection('routes').doc(r.id).delete();
    console.log(`  ✅ Removido: ${r.code} (${r.id})`);
  }

  console.log(`\n✅ ${toDelete.length} rascunhos órfãos removidos!`);
}

cleanup().catch(console.error);
