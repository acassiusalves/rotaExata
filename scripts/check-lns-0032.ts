import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Inicializar Firebase Admin
if (getApps().length === 0) {
  const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  initializeApp({
    credential: cert(serviceAccount as any),
  });
}

const db = getFirestore();

async function checkLNS0032() {
  console.log('\n🔍 Verificando rota LNS-0032...\n');

  try {
    // 1. Verificar se existe serviço com código LNS-0032
    console.log('1️⃣ Buscando serviço LNS-0032...');
    const servicesSnap = await db.collection('services').where('code', '==', 'LNS-0032').get();

    if (!servicesSnap.empty) {
      console.log('✅ Serviço LNS-0032 encontrado!');
      const serviceDoc = servicesSnap.docs[0];
      const serviceData = serviceDoc.data();

      console.log('\n📋 Dados do Serviço:');
      console.log(`   ID: ${serviceDoc.id}`);
      console.log(`   Código: ${serviceData.code}`);
      console.log(`   Nome: ${serviceData.name}`);
      console.log(`   Status: ${serviceData.status}`);
      console.log(`   Source: ${serviceData.source}`);
      console.log(`   Data criação: ${serviceData.createdAt?.toDate()}`);
      console.log(`   Total de stops: ${serviceData.allStops?.length || 0}`);
      console.log(`   IDs das rotas: ${serviceData.routeIds?.join(', ') || 'Nenhuma'}`);
      console.log(`   Pedidos Lunna: ${serviceData.lunnaOrderIds?.join(', ') || 'Nenhum'}`);

      if (serviceData.origin) {
        console.log(`   Origem: ${serviceData.origin.address || 'Sem endereço'}`);
      } else {
        console.log('   ⚠️ Origem: NÃO DEFINIDA');
      }

      console.log(`\n   Estatísticas:`);
      console.log(`   - Total Rotas: ${serviceData.stats?.totalRoutes || 0}`);
      console.log(`   - Rotas Completas: ${serviceData.stats?.completedRoutes || 0}`);
      console.log(`   - Total Entregas: ${serviceData.stats?.totalDeliveries || 0}`);
      console.log(`   - Entregas Completas: ${serviceData.stats?.completedDeliveries || 0}`);

      // Listar alguns stops
      if (serviceData.allStops && serviceData.allStops.length > 0) {
        console.log(`\n   📦 Primeiros stops (até 5):`);
        serviceData.allStops.slice(0, 5).forEach((stop: any, idx: number) => {
          console.log(`   ${idx + 1}. ${stop.customerName || 'Sem nome'} - Pedido: ${stop.orderNumber || 'N/A'}`);
        });
      }

      // 2. Buscar rotas associadas
      console.log('\n2️⃣ Buscando rotas do serviço LNS-0032...');
      const routesSnap = await db.collection('routes').where('serviceCode', '==', 'LNS-0032').get();

      if (routesSnap.empty) {
        console.log('⚠️ Nenhuma rota encontrada para o serviço LNS-0032');
      } else {
        console.log(`✅ ${routesSnap.size} rota(s) encontrada(s):\n`);

        routesSnap.forEach((routeDoc) => {
          const routeData = routeDoc.data();
          console.log(`   📍 Rota: ${routeData.code}`);
          console.log(`      ID: ${routeDoc.id}`);
          console.log(`      Nome: ${routeData.name}`);
          console.log(`      Status: ${routeData.status}`);
          console.log(`      Stops: ${routeData.stops?.length || 0}`);
          console.log(`      Unassigned: ${routeData.unassignedStops?.length || 0}`);
          console.log(`      Motorista: ${routeData.driverId || 'Não atribuído'}`);
          if (routeData.origin) {
            console.log(`      Origem: ${routeData.origin.address || 'Sem endereço'}`);
          } else {
            console.log('      ⚠️ Origem: NÃO DEFINIDA');
          }
          console.log('');
        });
      }

    } else {
      console.log('❌ Serviço LNS-0032 NÃO encontrado!\n');

      // Verificar se existe alguma rota com código LNS-0032-* (rotas órfãs)
      console.log('2️⃣ Verificando rotas órfãs com código LNS-0032-*...');
      const allRoutesSnap = await db.collection('routes').get();
      const orphanRoutes = allRoutesSnap.docs.filter(doc =>
        doc.data().code?.startsWith('LNS-0032-')
      );

      if (orphanRoutes.length > 0) {
        console.log(`⚠️ Encontradas ${orphanRoutes.length} rota(s) órfã(s):\n`);
        orphanRoutes.forEach(routeDoc => {
          const routeData = routeDoc.data();
          console.log(`   📍 Rota: ${routeData.code}`);
          console.log(`      ID: ${routeDoc.id}`);
          console.log(`      ServiceId: ${routeData.serviceId || 'VAZIO'}`);
          console.log(`      ServiceCode: ${routeData.serviceCode || 'VAZIO'}`);
          console.log('');
        });
      }
    }

    // 3. Verificar pedidos Lunna que deveriam estar nesse serviço
    console.log('\n3️⃣ Verificando pedidos do Lunna...');
    const ordersSnap = await db.collection('orders').where('rotaExataServiceCode', '==', 'LNS-0032').get();

    if (ordersSnap.empty) {
      console.log('⚠️ Nenhum pedido encontrado com rotaExataServiceCode = LNS-0032');
    } else {
      console.log(`✅ ${ordersSnap.size} pedido(s) encontrado(s):\n`);

      ordersSnap.forEach(orderDoc => {
        const orderData = orderDoc.data();
        console.log(`   📦 Pedido: ${orderData.number}`);
        console.log(`      ID: ${orderDoc.id}`);
        console.log(`      Cliente: ${orderData.client?.name || 'N/A'}`);
        console.log(`      Status Logístico: ${orderData.logisticsStatus || 'N/A'}`);
        console.log(`      ServiceId: ${orderData.rotaExataServiceId || 'N/A'}`);
        console.log(`      RouteId: ${orderData.rotaExataRouteId || 'Não alocado'}`);
        console.log(`      Valor: R$ ${orderData.billing?.finalValue || 0}`);
        console.log('');
      });
    }

    // 4. Verificar últimos serviços criados (para ver se LNS-0032 foi criado recentemente)
    console.log('\n4️⃣ Últimos 10 serviços criados:');
    const recentServicesSnap = await db.collection('services')
      .where('source', '==', 'lunna')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    console.log('');
    recentServicesSnap.forEach(doc => {
      const data = doc.data();
      console.log(`   ${data.code} - ${data.createdAt?.toDate()?.toLocaleString('pt-BR') || 'Sem data'} - ${data.stats?.totalDeliveries || 0} entregas`);
    });

    // 5. Verificar logs de atividade relacionados
    console.log('\n5️⃣ Verificando logs de atividade relacionados ao LNS-0032...');
    const activityLogsSnap = await db.collection('activity_logs')
      .where('entityCode', '==', 'LNS-0032')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    if (activityLogsSnap.empty) {
      console.log('⚠️ Nenhum log de atividade encontrado para LNS-0032');
    } else {
      console.log(`✅ ${activityLogsSnap.size} log(s) encontrado(s):\n`);
      activityLogsSnap.forEach(logDoc => {
        const logData = logDoc.data();
        console.log(`   📝 ${logData.timestamp?.toDate()?.toLocaleString('pt-BR') || 'Sem data'}`);
        console.log(`      Evento: ${logData.eventType}`);
        console.log(`      Ação: ${logData.action}`);
        console.log(`      Usuário: ${logData.userName || 'N/A'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Erro ao verificar:', error);
  }
}

// Executar
checkLNS0032()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
