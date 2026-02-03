/**
 * Script de Migração: Atualizar janelas de tempo nas rotas do Lunna
 *
 * Este script busca todas as rotas com source='lunna' e atualiza os stops
 * com os dados de janela de tempo (deliveryTimeStart/End) dos pedidos originais.
 *
 * Execução: npx tsx scripts/migrate-lunna-time-windows.ts
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
    console.error('❌ Credenciais do Firebase não encontradas no .env.local');
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

interface LunnaOrder {
  id: string;
  number: string;
  shipping?: {
    deliveryTimeStart?: string;
    deliveryTimeEnd?: string;
    deliveryPeriod?: string;
  };
}

interface PlaceValue {
  id: string;
  orderNumber?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  hasTimePreference?: boolean;
  [key: string]: any;
}

async function migrateTimeWindows() {
  console.log('🚀 Iniciando migração de janelas de tempo...\n');

  try {
    // 1. Buscar todas as rotas do Lunna
    const routesSnapshot = await db.collection('routes')
      .where('source', '==', 'lunna')
      .get();

    console.log(`📦 Encontradas ${routesSnapshot.size} rotas do Lunna\n`);

    if (routesSnapshot.empty) {
      console.log('✅ Nenhuma rota do Lunna encontrada para migrar.');
      return;
    }

    let totalUpdated = 0;
    let totalStopsUpdated = 0;

    for (const routeDoc of routesSnapshot.docs) {
      const routeData = routeDoc.data();
      const routeCode = routeData.code || routeDoc.id;
      const stops: PlaceValue[] = routeData.stops || [];

      console.log(`\n📍 Processando rota ${routeCode} (${stops.length} stops)...`);

      // Coletar números de pedidos dos stops
      const orderNumbers = stops
        .filter(stop => stop.orderNumber)
        .map(stop => stop.orderNumber!);

      if (orderNumbers.length === 0) {
        console.log(`   ⚠️ Nenhum stop com orderNumber encontrado`);
        continue;
      }

      // 2. Buscar os pedidos originais no Lunna
      const ordersSnapshot = await db.collection('orders')
        .where('number', 'in', orderNumbers)
        .get();

      // Criar mapa de pedidos por número
      const ordersMap = new Map<string, LunnaOrder>();
      ordersSnapshot.docs.forEach(doc => {
        const data = doc.data() as LunnaOrder;
        ordersMap.set(data.number, { id: doc.id, ...data });
      });

      console.log(`   📋 Encontrados ${ordersMap.size} pedidos correspondentes`);

      // 3. Atualizar stops com janela de tempo
      let stopsUpdatedInRoute = 0;
      const updatedStops = stops.map(stop => {
        if (!stop.orderNumber) return stop;

        const order = ordersMap.get(stop.orderNumber);
        if (!order) return stop;

        const timeWindowStart = order.shipping?.deliveryTimeStart || '';
        const timeWindowEnd = order.shipping?.deliveryTimeEnd || '';
        const hasTimePreference = !!(timeWindowStart && timeWindowEnd);

        // Verificar se precisa atualizar
        if (stop.timeWindowStart === timeWindowStart &&
            stop.timeWindowEnd === timeWindowEnd) {
          return stop; // Já está atualizado
        }

        stopsUpdatedInRoute++;

        return {
          ...stop,
          timeWindowStart,
          timeWindowEnd,
          hasTimePreference,
        };
      });

      // 4. Salvar se houve alterações
      if (stopsUpdatedInRoute > 0) {
        await db.collection('routes').doc(routeDoc.id).update({
          stops: updatedStops,
        });

        console.log(`   ✅ Atualizados ${stopsUpdatedInRoute} stops`);
        totalUpdated++;
        totalStopsUpdated += stopsUpdatedInRoute;
      } else {
        console.log(`   ℹ️ Nenhuma atualização necessária`);
      }
    }

    console.log('\n========================================');
    console.log(`✅ Migração concluída!`);
    console.log(`   Rotas atualizadas: ${totalUpdated}`);
    console.log(`   Stops atualizados: ${totalStopsUpdated}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  }
}

// Executar migração
migrateTimeWindows()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
