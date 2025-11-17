/**
 * Script de migração para calcular e atualizar o total de entregas dos motoristas
 *
 * Este script:
 * 1. Busca todas as rotas concluídas no sistema
 * 2. Conta quantas entregas bem-sucedidas cada motorista fez
 * 3. Atualiza o campo totalDeliveries de cada motorista
 *
 * Uso: npx tsx scripts/update-driver-deliveries.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';

// Inicializar Firebase Admin SDK
if (getApps().length === 0) {
  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');

  initializeApp({
    credential: cert(serviceAccountPath),
  });
}

const db = getFirestore();

interface DeliveryCount {
  [driverId: string]: {
    driverName: string;
    totalDeliveries: number;
  };
}

async function updateDriverDeliveries() {
  console.log('🚀 Iniciando atualização de total de entregas dos motoristas...\n');

  try {
    // 1. Buscar todas as rotas
    console.log('📦 Buscando todas as rotas...');
    const routesSnapshot = await db.collection('routes').get();
    console.log(`✅ Encontradas ${routesSnapshot.size} rotas\n`);

    // 2. Contar entregas por motorista
    const deliveryCounts: DeliveryCount = {};

    routesSnapshot.forEach((routeDoc) => {
      const routeData = routeDoc.data();
      const driverId = routeData.driverId;
      const driverName = routeData.driverName || 'Motorista sem nome';
      const stops = routeData.stops || [];

      // Se a rota tem motorista atribuído, contar entregas concluídas
      if (driverId) {
        if (!deliveryCounts[driverId]) {
          deliveryCounts[driverId] = {
            driverName,
            totalDeliveries: 0,
          };
        }

        // Contar apenas paradas com status 'completed'
        const completedStops = stops.filter(
          (stop: any) => stop.deliveryStatus === 'completed'
        );

        deliveryCounts[driverId].totalDeliveries += completedStops.length;
      }
    });

    console.log('📊 Contagem de entregas por motorista:');
    console.log('─'.repeat(60));

    const driverIds = Object.keys(deliveryCounts);

    if (driverIds.length === 0) {
      console.log('⚠️  Nenhum motorista com entregas encontrado.');
      return;
    }

    // Exibir contagem
    driverIds.forEach((driverId) => {
      const { driverName, totalDeliveries } = deliveryCounts[driverId];
      console.log(`👤 ${driverName} (${driverId}): ${totalDeliveries} entregas`);
    });

    console.log('─'.repeat(60));
    console.log(`\n📝 Total de motoristas: ${driverIds.length}\n`);

    // 3. Atualizar cada motorista no Firestore
    console.log('🔄 Atualizando documentos dos motoristas...\n');

    const batch = db.batch();
    let updateCount = 0;

    for (const driverId of driverIds) {
      const { driverName, totalDeliveries } = deliveryCounts[driverId];
      const driverRef = db.collection('users').doc(driverId);

      // Verificar se o motorista existe
      const driverDoc = await driverRef.get();

      if (driverDoc.exists) {
        batch.update(driverRef, {
          totalDeliveries,
          updatedAt: new Date(),
        });
        updateCount++;
        console.log(`  ✅ ${driverName}: ${totalDeliveries} entregas → atualizado`);
      } else {
        console.log(`  ⚠️  ${driverName}: Documento não encontrado (ID: ${driverId})`);
      }
    }

    // Executar batch update
    if (updateCount > 0) {
      await batch.commit();
      console.log(`\n✨ Sucesso! ${updateCount} motoristas atualizados com sucesso!`);
    } else {
      console.log('\n⚠️  Nenhum motorista foi atualizado.');
    }

    console.log('\n🎉 Migração concluída!\n');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  }
}

// Executar script
updateDriverDeliveries()
  .then(() => {
    console.log('✅ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
