/**
 * Script para corrigir origens das rotas do Lunna
 *
 * Este script atualiza a origem de todas as rotas do Lunna para usar
 * a origem padrão "Sol de Maria".
 *
 * Execução: npx tsx scripts/fix-lunna-route-origins.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

// Inicializar Firebase Admin SDK
if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase nao encontradas no .env.local');
    console.error('   Certifique-se de que FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY estao configurados.');
    process.exit(1);
  }

  // Replace escaped newlines with actual newlines
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

// Origem padrao Sol de Maria
const DEFAULT_ORIGIN = {
  id: 'default-origin-sol-de-maria',
  address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiania-GO',
  placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
  lat: -16.6786,
  lng: -49.2552,
};

async function fixLunnaRouteOrigins() {
  console.log('Iniciando correcao de origens das rotas Lunna...\n');

  try {
    // Buscar todas as rotas do Lunna
    const routesSnapshot = await db.collection('routes')
      .where('source', '==', 'lunna')
      .get();

    console.log(`Encontradas ${routesSnapshot.size} rotas do Lunna\n`);

    if (routesSnapshot.empty) {
      console.log('Nenhuma rota do Lunna encontrada.');
      return;
    }

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const routeDoc of routesSnapshot.docs) {
      const routeData = routeDoc.data();
      const routeCode = routeData.code || routeDoc.id;
      const currentOrigin = routeData.origin;

      console.log(`\nProcessando rota ${routeCode}...`);

      // Verificar se a origem atual e diferente da padrao
      const isDefaultOrigin = currentOrigin &&
        Math.abs(currentOrigin.lat - DEFAULT_ORIGIN.lat) < 0.001 &&
        Math.abs(currentOrigin.lng - DEFAULT_ORIGIN.lng) < 0.001;

      if (isDefaultOrigin) {
        console.log(`   Origem ja e a padrao (Sol de Maria)`);
        totalSkipped++;
        continue;
      }

      // Mostrar origem atual
      if (currentOrigin) {
        console.log(`   Origem atual: ${currentOrigin.address || 'Sem endereco'}`);
        console.log(`   Coordenadas: lat=${currentOrigin.lat}, lng=${currentOrigin.lng}`);
      } else {
        console.log(`   Origem atual: NENHUMA`);
      }

      // Atualizar para origem padrao
      await db.collection('routes').doc(routeDoc.id).update({
        origin: DEFAULT_ORIGIN,
      });

      console.log(`   Atualizada para: ${DEFAULT_ORIGIN.address}`);
      totalUpdated++;
    }

    console.log('\n========================================');
    console.log(`Correcao concluida!`);
    console.log(`   Rotas atualizadas: ${totalUpdated}`);
    console.log(`   Rotas ja corretas: ${totalSkipped}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Erro durante a correcao:', error);
    process.exit(1);
  }
}

// Executar correcao
fixLunnaRouteOrigins()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
