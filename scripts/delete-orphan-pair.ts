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
  // Verificar se o serviço referenciado existe
  const svcId = 'Ch8ZSFup7VHT0slSChWY';
  const svcDoc = await db.collection('services').doc(svcId).get();
  console.log(`Serviço ${svcId}: ${svcDoc.exists ? 'EXISTE' : 'NÃO EXISTE'}`);

  if (!svcDoc.exists) {
    console.log('Serviço não existe → rotas são órfãs definitivamente');
  }

  // Deletar rotas órfãs
  const orphanIds = ['88ANgv7LsotD6nA4ex7s', 'VBX6vXPfcfExmy9wy4G1'];
  for (const id of orphanIds) {
    await db.collection('routes').doc(id).delete();
    console.log(`✅ Deletada rota órfã: ${id}`);
  }

  console.log('\n✅ Cleanup concluído!');
}

cleanup().catch(console.error);
