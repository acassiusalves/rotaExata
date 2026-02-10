/**
 * Script para adicionar routeCreatedAt aos pagamentos existentes
 * Execute com: npx tsx scripts/add-route-created-at-to-payments.ts
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Credenciais do Firebase não encontradas no .env.local');
  console.error('Verifique se FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY estão definidas');
  process.exit(1);
}

// Inicializar Firebase Admin
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

async function addRouteCreatedAtToPayments() {
  console.log('🔄 Iniciando migração de pagamentos...\n');

  try {
    // Buscar todos os pagamentos
    const paymentsSnapshot = await db.collection('driverPayments').get();

    console.log(`📊 Total de pagamentos encontrados: ${paymentsSnapshot.size}\n`);

    if (paymentsSnapshot.size === 0) {
      console.log('Nenhum pagamento encontrado.');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const paymentDoc of paymentsSnapshot.docs) {
      const payment = paymentDoc.data();

      // Se já tem routeCreatedAt, pula
      if (payment.routeCreatedAt) {
        skipped++;
        continue;
      }

      try {
        // Busca a rota para pegar o createdAt
        const routeDoc = await db.collection('routes').doc(payment.routeId).get();

        if (!routeDoc.exists) {
          console.warn(`⚠️  Rota não encontrada para pagamento ${paymentDoc.id} (routeId: ${payment.routeId})`);
          errors++;
          continue;
        }

        const routeData = routeDoc.data();

        if (!routeData?.createdAt) {
          console.warn(`⚠️  Rota ${payment.routeId} não tem campo createdAt`);
          errors++;
          continue;
        }

        // Atualiza o pagamento com routeCreatedAt
        await paymentDoc.ref.update({
          routeCreatedAt: routeData.createdAt,
        });

        updated++;

        // Log de progresso a cada 10 pagamentos
        if (updated % 10 === 0) {
          console.log(`✅ ${updated} pagamentos atualizados...`);
        }
      } catch (error) {
        console.error(`❌ Erro ao processar pagamento ${paymentDoc.id}:`, error);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA MIGRAÇÃO:');
    console.log('='.repeat(60));
    console.log(`✅ Atualizados: ${updated}`);
    console.log(`⏭️  Pulados (já tinham routeCreatedAt): ${skipped}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📊 Total: ${paymentsSnapshot.size}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    throw error;
  }
}

addRouteCreatedAtToPayments()
  .then(() => {
    console.log('\n✅ Migração finalizada com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro na migração:', error);
    process.exit(1);
  });
