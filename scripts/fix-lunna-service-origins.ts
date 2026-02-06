/**
 * Script para corrigir origens dos serviços do Lunna
 *
 * Este script atualiza a origem de todos os serviços para usar
 * a origem padrão "Sol de Maria".
 *
 * Execução: npx tsx scripts/fix-lunna-service-origins.ts
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
    console.error('Credenciais do Firebase não encontradas no .env.local');
    console.error('   Certifique-se de que FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY estão configurados.');
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

// Origem padrão Sol de Maria
const DEFAULT_ORIGIN = {
  id: 'default-origin-sol-de-maria',
  address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
  placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
  lat: -16.6786,
  lng: -49.2552,
};

async function fixLunnaServiceOrigins() {
  console.log('Iniciando correção de origens dos serviços Lunna...\n');

  try {
    // Buscar todos os serviços
    const servicesSnapshot = await db.collection('services').get();

    console.log(`Encontrados ${servicesSnapshot.size} serviços\n`);

    if (servicesSnapshot.empty) {
      console.log('Nenhum serviço encontrado.');
      return;
    }

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const serviceDoc of servicesSnapshot.docs) {
      const serviceData = serviceDoc.data();
      const serviceCode = serviceData.code || serviceDoc.id;
      const currentOrigin = serviceData.origin;

      console.log(`\nProcessando serviço ${serviceCode}...`);

      // Verificar se a origem atual é diferente da padrão
      const isDefaultOrigin = currentOrigin &&
        Math.abs(currentOrigin.lat - DEFAULT_ORIGIN.lat) < 0.001 &&
        Math.abs(currentOrigin.lng - DEFAULT_ORIGIN.lng) < 0.001;

      if (isDefaultOrigin) {
        console.log(`   Origem já é a padrão (Sol de Maria)`);
        totalSkipped++;
        continue;
      }

      // Mostrar origem atual
      if (currentOrigin) {
        console.log(`   Origem atual: ${currentOrigin.address || 'Sem endereço'}`);
        console.log(`   Coordenadas: lat=${currentOrigin.lat}, lng=${currentOrigin.lng}`);
      } else {
        console.log(`   Origem atual: NENHUMA`);
      }

      // Atualizar para origem padrão
      await db.collection('services').doc(serviceDoc.id).update({
        origin: DEFAULT_ORIGIN,
      });

      console.log(`   ✅ Atualizada para: ${DEFAULT_ORIGIN.address}`);
      totalUpdated++;
    }

    console.log('\n========================================');
    console.log(`Correção concluída!`);
    console.log(`   Serviços atualizados: ${totalUpdated}`);
    console.log(`   Serviços já corretos: ${totalSkipped}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Erro durante a correção:', error);
    process.exit(1);
  }
}

// Executar correção
fixLunnaServiceOrigins()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
