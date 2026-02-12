// Script para debugar o serviço NRKTrbRTDYkLOF1pT6qf
// Execute com: node debug-service-NRKTrbRTDYkLOF1pT6qf.js

const admin = require('firebase-admin');
const path = require('path');

// Inicializar Firebase Admin
const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const serviceId = 'NRKTrbRTDYkLOF1pT6qf';

async function debugService() {
  console.log('🔍 Debugando serviço:', serviceId);
  console.log('='.repeat(80));

  // 1. Verificar se o serviço existe
  const serviceRef = db.collection('services').doc(serviceId);
  const serviceSnap = await serviceRef.get();

  if (!serviceSnap.exists) {
    console.log('❌ SERVIÇO NÃO EXISTE!');
    process.exit(1);
  }

  const serviceData = serviceSnap.data();
  console.log('\n📦 DADOS DO SERVIÇO:');
  console.log('  - Code:', serviceData.code);
  console.log('  - Name:', serviceData.name);
  console.log('  - Status:', serviceData.status);
  console.log('  - allStops:', serviceData.allStops?.length || 0, 'stops');
  console.log('  - routeIds:', serviceData.routeIds?.length || 0, 'rotas');
  console.log('  - lunnaOrderIds:', serviceData.lunnaOrderIds?.length || 0, 'pedidos');

  // 2. Mostrar allStops
  if (serviceData.allStops && serviceData.allStops.length > 0) {
    console.log('\n📍 ALL STOPS (primeiros 10):');
    serviceData.allStops.slice(0, 10).forEach((stop, idx) => {
      console.log(`  ${idx + 1}. ${stop.orderNumber || 'SEM NUMERO'} - ${stop.customerName} - lat:${stop.lat}, lng:${stop.lng}`);
    });
  } else {
    console.log('\n⚠️ NENHUM STOP NO allStops!');
  }

  // 3. Buscar pedidos linkados ao serviço
  console.log('\n🔍 BUSCANDO PEDIDOS NA COLEÇÃO ORDERS:');
  const ordersQuery = db.collection('orders')
    .where('rotaExataServiceId', '==', serviceId);
  const ordersSnap = await ordersQuery.get();

  console.log(`  - Encontrados: ${ordersSnap.size} pedidos`);

  if (ordersSnap.size > 0) {
    console.log('\n📦 PEDIDOS ENCONTRADOS:');
    ordersSnap.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`  ${idx + 1}. Número: ${data.number}`);
      console.log(`     - logisticsStatus: ${data.logisticsStatus || 'NÃO DEFINIDO'}`);
      console.log(`     - rotaExataServiceId: ${data.rotaExataServiceId || 'NÃO DEFINIDO'}`);
      console.log(`     - rotaExataRouteId: ${data.rotaExataRouteId || 'NÃO DEFINIDO'}`);
      console.log(`     - Cliente: ${data.client?.name || 'Sem nome'}`);
    });
  }

  // 4. Buscar rotas do serviço
  console.log('\n🚗 BUSCANDO ROTAS DO SERVIÇO:');
  const routesQuery = db.collection('routes')
    .where('serviceId', '==', serviceId);
  const routesSnap = await routesQuery.get();

  console.log(`  - Encontradas: ${routesSnap.size} rotas`);

  if (routesSnap.size > 0) {
    console.log('\n🚗 ROTAS ENCONTRADAS:');
    routesSnap.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`  ${idx + 1}. ${data.code} - ${data.name || 'Sem nome'}`);
      console.log(`     - ID: ${doc.id}`);
      console.log(`     - Status: ${data.status}`);
      console.log(`     - Stops: ${data.stops?.length || 0}`);
      console.log(`     - UnassignedStops: ${data.unassignedStops?.length || 0}`);

      if (data.unassignedStops && data.unassignedStops.length > 0) {
        console.log(`     - Unassigned orders:`, data.unassignedStops.map(s => s.orderNumber).join(', '));
      }
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Debug completo!\n');

  // 5. Diagnóstico
  console.log('🔎 DIAGNÓSTICO:');

  if (!serviceData.allStops || serviceData.allStops.length === 0) {
    console.log('❌ PROBLEMA: allStops está vazio!');
    console.log('   → O Lunna NÃO está adicionando stops ao services.allStops');
  }

  if (ordersSnap.size === 0) {
    console.log('❌ PROBLEMA: Nenhum pedido linkado ao serviço!');
    console.log('   → O Lunna NÃO está setando rotaExataServiceId nos pedidos');
  }

  if (ordersSnap.size > 0 && (!serviceData.allStops || serviceData.allStops.length === 0)) {
    console.log('⚠️ INCONSISTÊNCIA: Pedidos existem em orders mas não em services.allStops!');
    console.log('   → O Lunna está setando rotaExataServiceId mas NÃO está adicionando ao allStops');
    console.log('   → Solução: Lunna precisa fazer updateDoc com arrayUnion no services.allStops');
  }

  process.exit(0);
}

debugService().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
