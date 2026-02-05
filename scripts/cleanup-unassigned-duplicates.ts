/**
 * Script para limpar unassignedStops duplicados de rotas
 * O P0042 já está nos stops da rota LNS-0001-D mas também aparece 3x em unassignedStops
 * Execute com: npx tsx scripts/cleanup-unassigned-duplicates.ts
 */

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
  if (!routeDoc.exists) {
    console.log('Rota não encontrada');
    return;
  }

  const data = routeDoc.data()!;
  const stops = data.stops || [];
  const unassigned = data.unassignedStops || [];

  console.log('=== ANTES DA LIMPEZA ===');
  console.log('Stops:', stops.length, '- orderNumbers:', stops.map((s: any) => s.orderNumber));
  console.log('UnassignedStops:', unassigned.length, '- orderNumbers:', unassigned.map((s: any) => s.orderNumber));

  // Coletar orderNumbers que já estão nos stops
  const assignedOrderNumbers = new Set(stops.map((s: any) => s.orderNumber).filter(Boolean));

  // Filtrar unassigned: remover os que já estão nos stops
  const cleanedUnassigned = unassigned.filter((s: any) => {
    if (s.orderNumber && assignedOrderNumbers.has(s.orderNumber)) {
      console.log(`  Removendo duplicata: ${s.orderNumber} (${s.customerName}) - já está nos stops`);
      return false;
    }
    return true;
  });

  // Também limpar lunnaOrderIds duplicados
  const uniqueLunnaIds = [...new Set(data.lunnaOrderIds || [])];

  console.log('\n=== APÓS LIMPEZA ===');
  console.log('UnassignedStops:', cleanedUnassigned.length);
  console.log('LunnaOrderIds:', uniqueLunnaIds);

  // Aplicar
  await db.collection('routes').doc(routeId).update({
    unassignedStops: cleanedUnassigned,
    lunnaOrderIds: uniqueLunnaIds,
  });

  console.log('\n✅ Limpeza concluída!');
}

cleanup().catch(console.error);
