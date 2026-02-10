/**
 * Script para recalcular todos os pagamentos pendentes com a nova lógica
 * Execute com: npx tsx scripts/recalculate-all-payments.ts
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

async function recalculateAllPayments() {
  console.log('🔄 Iniciando recálculo de pagamentos...\n');

  try {
    // Buscar todos os pagamentos pendentes
    const paymentsSnapshot = await db
      .collection('driverPayments')
      .where('status', '==', 'pending')
      .get();

    console.log(`📊 Total de pagamentos pendentes: ${paymentsSnapshot.size}\n`);

    if (paymentsSnapshot.size === 0) {
      console.log('Nenhum pagamento pendente encontrado.');
      return;
    }

    let recalculated = 0;
    let errors = 0;

    for (const paymentDoc of paymentsSnapshot.docs) {
      const payment = paymentDoc.data();

      try {
        // Busca a rota para recalcular
        const routeDoc = await db.collection('routes').doc(payment.routeId).get();

        if (!routeDoc.exists) {
          console.warn(`⚠️  Rota não encontrada: ${payment.routeId}`);
          errors++;
          continue;
        }

        const routeData = routeDoc.data();
        if (!routeData) continue;

        // Busca regras ativas
        const rulesDoc = await db.collection('earningsRules').doc('active').get();
        if (!rulesDoc.exists) {
          console.error('❌ Regras de ganhos não encontradas');
          errors++;
          continue;
        }

        const rules = rulesDoc.data();
        if (!rules) continue;

        // Calcula valores usando a nova lógica
        const origin = routeData.origin || routeData.stops[0];
        let deliveryBonuses = 0;
        let failedAttemptBonuses = 0;

        for (const stop of routeData.stops || []) {
          const stopValue = calculateStopPrice(stop, origin);

          if (stop.deliveryStatus === 'completed') {
            deliveryBonuses += stopValue;
          } else if (stop.deliveryStatus === 'failed' && stop.wentToLocation === true) {
            failedAttemptBonuses += stopValue * 0.2;
          }
        }

        // Total de ganhos = soma das paradas
        const totalEarnings = deliveryBonuses + failedAttemptBonuses;

        // Atualiza o pagamento
        await paymentDoc.ref.update({
          'breakdown.basePay': 0,
          'breakdown.distanceEarnings': 0,
          'breakdown.deliveryBonuses': deliveryBonuses,
          'breakdown.failedAttemptBonuses': failedAttemptBonuses,
          totalEarnings: totalEarnings,
          updatedAt: new Date(),
        });

        recalculated++;

        if (recalculated % 10 === 0) {
          console.log(`✅ ${recalculated} pagamentos recalculados...`);
        }
      } catch (error) {
        console.error(`❌ Erro ao processar pagamento ${paymentDoc.id}:`, error);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DO RECÁLCULO:');
    console.log('='.repeat(60));
    console.log(`✅ Recalculados: ${recalculated}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📊 Total: ${paymentsSnapshot.size}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro durante o recálculo:', error);
    throw error;
  }
}

/**
 * Calcula o preço de uma parada baseado na localização
 */
function calculateStopPrice(stop: any, origin?: any): number {
  const city = (stop.cidade || stop.city || '').toLowerCase().trim();
  const neighborhood = (stop.bairro || stop.neighborhood || '').toLowerCase().trim();

  // Cidades de R$ 20
  const citiesR20 = ['senador canedo', 'canedo', 'trindade', 'goianira'];
  if (citiesR20.some(c => city.includes(c) || neighborhood.includes(c))) {
    return 20;
  }

  // Goiânia e Aparecida de Goiânia - depende da distância da origem
  const citiesGoianiaArea = ['goiânia', 'goiania', 'aparecida', 'aparecida de goiania', 'aparecida de goiânia'];
  const isGoianiaArea = citiesGoianiaArea.some(c => city.includes(c) || neighborhood.includes(c));

  if (isGoianiaArea && origin && origin.lat && origin.lng && stop.lat && stop.lng) {
    const distance = calculateDistance(origin.lat, origin.lng, stop.lat, stop.lng);
    // Até 7km = R$ 5, acima de 7km = R$ 10
    return distance <= 7 ? 5 : 10;
  }

  // Padrão para Goiânia/Aparecida se não conseguir calcular distância
  if (isGoianiaArea) {
    return 5;
  }

  // Padrão para cidades não mapeadas
  return 10;
}

/**
 * Calcula a distância entre dois pontos usando Haversine
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

recalculateAllPayments()
  .then(() => {
    console.log('\n✅ Recálculo finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro no recálculo:', error);
    process.exit(1);
  });
