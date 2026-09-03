/**
 * Script de migração para calcular e atualizar o total de entregas dos motoristas
 *
 * Este script:
 * 1. Busca todas as rotas concluídas no sistema
 * 2. Conta quantas entregas bem-sucedidas cada motorista fez
 * 3. Atualiza o campo totalDeliveries de cada motorista
 *
 * Uso: npx tsx scripts/update-driver-deliveries.ts [--apply]
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import * as path from 'path';
import { commitDriverDeliveryUpdates } from './driver-delivery-repair';

const shouldApply = process.argv.includes('--apply');
const modeLabel = shouldApply ? 'APLICAÇÃO' : 'SIMULAÇÃO';

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
  console.log(`Modo: ${modeLabel}`);
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

    // A população auditada é a dos usuários que o sistema reconhece como motoristas.
    console.log('👥 Buscando todos os motoristas...');
    const driversSnapshot = await db
      .collection('users')
      .where('role', '==', 'driver')
      .get();
    console.log(`✅ Encontrados ${driversSnapshot.size} motoristas\n`);

    const driverDocs = new Map(driversSnapshot.docs.map((driverDoc) => [driverDoc.id, driverDoc]));
    const routeDriverIds = Object.keys(deliveryCounts);
    routeDriverIds
      .filter((driverId) => !driverDocs.has(driverId))
      .forEach((driverId) => {
        const driverName = deliveryCounts[driverId].driverName;
        console.log(
          `  ⚠️  Rota referencia motorista ausente: ${driverName} (ID: ${driverId}); ignorando.`
        );
      });

    console.log('📊 Contagem de entregas por motorista:');
    console.log('─'.repeat(60));

    const driverIds = driversSnapshot.docs.map((driverDoc) => driverDoc.id);

    if (driverIds.length === 0) {
      console.log('⚠️  Nenhum motorista encontrado.');
      return;
    }

    // Exibir contagem
    driverIds.forEach((driverId) => {
      const driverData = driverDocs.get(driverId)?.data() || {};
      const driverName =
        driverData.displayName ||
        driverData.name ||
        deliveryCounts[driverId]?.driverName ||
        driverData.email ||
        'Motorista sem nome';
      const totalDeliveries = deliveryCounts[driverId]?.totalDeliveries || 0;
      console.log(`👤 ${driverName} (${driverId}): ${totalDeliveries} entregas`);
    });

    console.log('─'.repeat(60));
    console.log(`\n📝 Total de motoristas: ${driverIds.length}\n`);

    // 3. Atualizar cada motorista no Firestore
    console.log('🔄 Conferindo documentos dos motoristas...\n');

    let updateCount = 0;
    const pendingUpdates: Array<{
      reference: DocumentReference;
      totalDeliveries: number;
    }> = [];

    for (const driverId of driverIds) {
      const driverDoc = driverDocs.get(driverId);
      if (!driverDoc) continue;

      const driverData = driverDoc.data();
      const driverName =
        driverData.displayName ||
        driverData.name ||
        deliveryCounts[driverId]?.driverName ||
        driverData.email ||
        'Motorista sem nome';
      const totalDeliveries = deliveryCounts[driverId]?.totalDeliveries || 0;
      const currentTotal = driverData.totalDeliveries || 0;

      if (currentTotal !== totalDeliveries) {
        console.log(`  ${driverName}: ${currentTotal} -> ${totalDeliveries}`);
        updateCount++;

        pendingUpdates.push({ reference: driverDoc.ref, totalDeliveries });
      } else {
        console.log(`  ${driverName}: ${currentTotal} (sem alteração)`);
      }
    }

    const writeResult = await commitDriverDeliveryUpdates({
      updates: pendingUpdates,
      shouldApply,
      createBatch: () => {
        const batch = db.batch();
        return {
          update: (reference, data) => batch.update(reference, data),
          commit: () => batch.commit(),
        };
      },
    });

    if (!shouldApply) {
      console.log(`\nSIMULAÇÃO: ${updateCount} motorista(s) precisariam de ajuste.`);
      console.log('Execute novamente com --apply somente após revisar os valores.');
      return;
    }

    if (writeResult.updateCount > 0) {
      console.log(
        `\n${writeResult.updateCount} motorista(s) atualizado(s) em ${writeResult.commitCount} batch(es).`,
      );
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
