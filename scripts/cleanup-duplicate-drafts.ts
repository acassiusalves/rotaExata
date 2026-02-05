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
  console.log('🔍 Buscando TODAS as rotas com serviceId...\n');

  // Buscar todas as rotas que pertencem a um serviço (não apenas drafts)
  const routesSnap = await db.collection('routes')
    .where('serviceId', '!=', '')
    .get();

  console.log(`Encontradas ${routesSnap.size} rotas com serviceId total\n`);

  // Agrupar por serviceId
  const byService: Record<string, Array<{ id: string; name: string; code: string; status: string; stopsCount: number; createdAt: any }>> = {};

  for (const routeDoc of routesSnap.docs) {
    const data = routeDoc.data();
    const serviceId = data.serviceId;
    if (!serviceId) continue;

    if (!byService[serviceId]) byService[serviceId] = [];
    byService[serviceId].push({
      id: routeDoc.id,
      name: data.name || 'sem nome',
      code: data.code || '',
      status: data.status || 'draft',
      stopsCount: data.stops?.length || 0,
      createdAt: data.createdAt,
    });
  }

  for (const [serviceId, routes] of Object.entries(byService)) {
    const dispatched = routes.filter(r => r.status !== 'draft');
    const drafts = routes.filter(r => r.status === 'draft');

    console.log(`\nServiço ${serviceId}: ${routes.length} rotas total (${dispatched.length} despachadas, ${drafts.length} drafts)`);
    routes.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.status}] ${r.id} - ${r.name} / ${r.code} (${r.stopsCount} stops)`);
    });

    // Se existem rotas despachadas E drafts duplicados, deletar os drafts
    if (dispatched.length > 0 && drafts.length > 0) {
      console.log(`  → Deletando ${drafts.length} draft(s) duplicado(s) (já existem ${dispatched.length} rotas despachadas)...`);
      for (const r of drafts) {
        await db.collection('routes').doc(r.id).delete();
        console.log(`    ✅ Deletado draft: ${r.id} (${r.name})`);
      }

      // Atualizar o serviço com apenas os IDs das rotas mantidas (despachadas)
      const keptIds = dispatched.map(r => r.id);
      await db.collection('services').doc(serviceId).update({
        routeIds: keptIds,
        'stats.totalRoutes': keptIds.length,
      });
      console.log(`  → Serviço atualizado com routeIds:`, keptIds);
    } else if (drafts.length > 2) {
      // Sem rotas despachadas, mas muitos drafts duplicados - manter os 2 primeiros
      const toDelete = drafts.slice(2);
      console.log(`  → Deletando ${toDelete.length} draft(s) excedente(s)...`);
      for (const r of toDelete) {
        await db.collection('routes').doc(r.id).delete();
        console.log(`    ✅ Deletado: ${r.id}`);
      }

      const keptIds = drafts.slice(0, 2).map(r => r.id);
      await db.collection('services').doc(serviceId).update({
        routeIds: keptIds,
        'stats.totalRoutes': keptIds.length,
      });
      console.log(`  → Serviço atualizado com routeIds:`, keptIds);
    } else {
      console.log(`  → OK, sem duplicatas`);
    }
  }

  console.log('\n✅ Limpeza concluída!');
}

cleanup().catch(console.error);
