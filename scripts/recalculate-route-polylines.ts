/**
 * Script para recalcular polylines das rotas usando o origin correto
 *
 * Execução: npx tsx scripts/recalculate-route-polylines.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase não encontradas');
    process.exit(1);
  }

  const formattedKey = privateKey.replace(/\\n/g, '\n');

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: formattedKey,
    }),
    projectId: projectId,
  });
}

const db = getFirestore();

async function recalculatePolylines() {
  console.log('Recalculando polylines das rotas...\n');
  console.log('⚠️  IMPORTANTE: Este script vai recalcular as polylines.');
  console.log('    As rotas serão otimizadas com o origin correto (Sol de Maria).\n');

  try {
    // Buscar rotas do serviço LNS-0004 que estão dispatched
    const routesSnapshot = await db.collection('routes')
      .where('serviceId', '==', 'lsJlk5OB8DEQt9DLsfyY')
      .where('status', 'in', ['dispatched', 'in_progress'])
      .get();

    console.log(`Encontradas ${routesSnapshot.size} rotas dispatched/in_progress\n`);

    if (routesSnapshot.empty) {
      console.log('Nenhuma rota encontrada para recalcular.');
      return;
    }

    let totalRecalculated = 0;

    for (const routeDoc of routesSnapshot.docs) {
      const routeData = routeDoc.data();
      const routeCode = routeData.code || routeDoc.id;
      const origin = routeData.origin;
      const stops = routeData.stops || [];

      console.log(`\nProcessando rota ${routeCode}...`);
      console.log(`  Stops: ${stops.length}`);

      if (stops.length === 0) {
        console.log(`  ⏭️  Pulando (sem stops)`);
        continue;
      }

      if (!origin || !origin.lat || !origin.lng) {
        console.log(`  ❌ Sem origin válido`);
        continue;
      }

      try {
        // Chamar API para recalcular a rota
        const response = await fetch('http://localhost:2000/api/compute-optimized-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, stops }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`  ❌ Erro na API: ${errorText}`);
          continue;
        }

        const routeInfo = await response.json();

        // Atualizar no Firestore
        await db.collection('routes').doc(routeDoc.id).update({
          encodedPolyline: routeInfo.encodedPolyline,
          distanceMeters: routeInfo.distanceMeters,
          duration: routeInfo.duration,
          updatedAt: new Date(),
        });

        console.log(`  ✅ Polyline recalculada`);
        console.log(`     Distância: ${(routeInfo.distanceMeters / 1000).toFixed(2)} km`);
        console.log(`     Duração: ${routeInfo.duration}`);
        totalRecalculated++;

      } catch (error) {
        console.log(`  ❌ Erro ao recalcular: ${error}`);
      }
    }

    console.log('\n========================================');
    console.log(`Recálculo concluído!`);
    console.log(`  Rotas recalculadas: ${totalRecalculated}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Erro durante o recálculo:', error);
    process.exit(1);
  }
}

recalculatePolylines()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
