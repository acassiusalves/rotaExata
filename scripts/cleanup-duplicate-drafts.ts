/**
 * Script para limpar rotas draft duplicadas de serviços
 * Execute com: npx tsx scripts/cleanup-duplicate-drafts.ts
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Credenciais do Firebase não encontradas no .env.local');
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
  console.log('🔍 Buscando rotas draft com serviceId...\n');

  const routesSnap = await db.collection('routes')
    .where('status', '==', 'draft')
    .get();

  console.log(`Encontradas ${routesSnap.size} rotas draft total\n`);

  // Agrupar por serviceId
  const byService: Record<string, Array<{ id: string; name: string; stopsCount: number; createdAt: any }>> = {};

  for (const doc of routesSnap.docs) {
    const data = doc.data();
    const serviceId = data.serviceId;
    if (!serviceId) continue;

    if (!byService[serviceId]) byService[serviceId] = [];
    byService[serviceId].push({
      id: doc.id,
      name: data.name || 'sem nome',
      stopsCount: data.stops?.length || 0,
      createdAt: data.createdAt,
    });
  }

  for (const [serviceId, routes] of Object.entries(byService)) {
    console.log(`\nServiço ${serviceId}: ${routes.length} rotas draft`);
    routes.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.id} - ${r.name} (${r.stopsCount} stops)`);
    });

    if (routes.length > 2) {
      // Manter as 2 primeiras, deletar as duplicatas
      const toDelete = routes.slice(2);
      console.log(`  → Deletando ${toDelete.length} duplicatas...`);
      for (const r of toDelete) {
        await db.collection('routes').doc(r.id).delete();
        console.log(`    ✅ Deletado: ${r.id}`);
      }

      // Atualizar o serviço com apenas os IDs das rotas mantidas
      const keptIds = routes.slice(0, 2).map(r => r.id);
      await db.collection('services').doc(serviceId).update({
        routeIds: keptIds,
        'stats.totalRoutes': keptIds.length,
      });
      console.log(`  → Serviço atualizado com routeIds:`, keptIds);
    }
  }

  console.log('\n✅ Limpeza concluída!');
}

cleanup().catch(console.error);
