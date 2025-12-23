/**
 * Script para limpar motoristas offline manualmente
 * Execute com: npx tsx scripts/cleanup-offline-drivers.ts
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Credenciais do Firebase não encontradas');
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

async function cleanupOfflineDrivers() {
  const now = new Date();
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

  console.log('Buscando motoristas...');
  console.log('Timestamp limite:', twoMinutesAgo.toISOString());

  // Buscar todos os motoristas
  const allDrivers = await db
    .collection('users')
    .where('role', '==', 'driver')
    .get();

  console.log('\nTotal de motoristas encontrados:', allDrivers.size);

  const driversToUpdate: Array<{ id: string; name: string }> = [];

  allDrivers.forEach(doc => {
    const data = doc.data();
    const lastSeen = data.lastSeenAt?.toDate();
    const status = data.status;
    const name = data.displayName || data.email || doc.id;

    console.log(`- ${name}: status=${status}, lastSeenAt=${lastSeen?.toISOString() || 'N/A'}`);

    if ((status === 'online' || status === 'available') && lastSeen && lastSeen < twoMinutesAgo) {
      driversToUpdate.push({ id: doc.id, name });
    }
  });

  if (driversToUpdate.length === 0) {
    console.log('\nNenhum motorista precisa ser atualizado para offline.');
    return;
  }

  console.log('\nMotoristas a serem marcados como offline:');
  driversToUpdate.forEach(d => console.log(`  - ${d.name}`));

  // Atualizar em batch
  const batch = db.batch();
  driversToUpdate.forEach(driver => {
    batch.update(db.collection('users').doc(driver.id), { status: 'offline' });
  });

  await batch.commit();
  console.log(`\n${driversToUpdate.length} motorista(s) marcado(s) como offline!`);
}

cleanupOfflineDrivers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
