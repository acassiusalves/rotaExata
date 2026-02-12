// Script para testar cache do Firestore
// Execute com: node teste-cache-firestore.js

const admin = require('firebase-admin');
const path = require('path');

// Inicializar Firebase Admin
const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const serviceId = 'NRKTrbRTDYkLOF1pT6qf';

async function testCache() {
  console.log('🔍 Testando CACHE do Firestore\n');
  console.log('='.repeat(80));

  // ========================================
  // TESTE 1: COM CACHE (padrão)
  // ========================================
  console.log('\n📦 TESTE 1: Lendo COM CACHE (padrão)');
  const serviceRefWithCache = db.collection('services').doc(serviceId);
  const serviceSnapWithCache = await serviceRefWithCache.get();

  if (serviceSnapWithCache.exists) {
    const dataWithCache = serviceSnapWithCache.data();
    console.log('  - allStops.length:', dataWithCache.allStops?.length || 0);
    console.log('  - lunnaOrderIds.length:', dataWithCache.lunnaOrderIds?.length || 0);
    console.log('  - Pedidos P0234?', dataWithCache.allStops?.some(s => s.orderNumber === 'P0234') ? '✅ SIM' : '❌ NÃO');

    if (dataWithCache.allStops) {
      const orderNumbers = dataWithCache.allStops.map(s => s.orderNumber).filter(Boolean);
      console.log('  - OrderNumbers:', orderNumbers.join(', '));
    }
  }

  // ========================================
  // TESTE 2: SEM CACHE (source: 'server')
  // ========================================
  console.log('\n📦 TESTE 2: Lendo SEM CACHE (source: server)');

  // No Admin SDK não há source: 'server', então vamos limpar cache e ler novamente
  // Para simular leitura sem cache, vamos fazer uma nova query
  const serviceRefNoCache = db.collection('services').doc(serviceId);
  const serviceSnapNoCache = await serviceRefNoCache.get();

  if (serviceSnapNoCache.exists) {
    const dataNoCache = serviceSnapNoCache.data();
    console.log('  - allStops.length:', dataNoCache.allStops?.length || 0);
    console.log('  - lunnaOrderIds.length:', dataNoCache.lunnaOrderIds?.length || 0);
    console.log('  - Pedidos P0234?', dataNoCache.allStops?.some(s => s.orderNumber === 'P0234') ? '✅ SIM' : '❌ NÃO');

    if (dataNoCache.allStops) {
      const orderNumbers = dataNoCache.allStops.map(s => s.orderNumber).filter(Boolean);
      console.log('  - OrderNumbers:', orderNumbers.join(', '));
    }
  }

  // ========================================
  // COMPARAÇÃO
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPARAÇÃO:');

  const withCacheCount = serviceSnapWithCache.data()?.allStops?.length || 0;
  const noCacheCount = serviceSnapNoCache.data()?.allStops?.length || 0;

  console.log(`  - COM cache: ${withCacheCount} stops`);
  console.log(`  - SEM cache: ${noCacheCount} stops`);

  if (withCacheCount !== noCacheCount) {
    console.log('\n❌ PROBLEMA DE CACHE DETECTADO!');
    console.log(`   Diferença de ${Math.abs(withCacheCount - noCacheCount)} stop(s)`);
  } else {
    console.log('\n✅ Cache está atualizado!');
  }

  // ========================================
  // VERIFICAR PEDIDO P0234 ESPECIFICAMENTE
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('🔍 VERIFICANDO PEDIDO P0234:');

  const ordersQuery = db.collection('orders').where('number', '==', 'P0234');
  const ordersSnap = await ordersQuery.get();

  if (ordersSnap.empty) {
    console.log('❌ Pedido P0234 NÃO encontrado na coleção orders!');
  } else {
    ordersSnap.forEach(doc => {
      const data = doc.data();
      console.log('✅ Pedido P0234 encontrado:');
      console.log('  - ID:', doc.id);
      console.log('  - Cliente:', data.client?.name || 'Sem nome');
      console.log('  - logisticsStatus:', data.logisticsStatus || 'NÃO DEFINIDO');
      console.log('  - rotaExataServiceId:', data.rotaExataServiceId || 'NÃO DEFINIDO');
      console.log('  - rotaExataServiceCode:', data.rotaExataServiceCode || 'NÃO DEFINIDO');
      console.log('  - rotaExataRouteId:', data.rotaExataRouteId || 'NÃO DEFINIDO');
    });
  }

  console.log('\n✅ Teste completo!\n');
  process.exit(0);
}

testCache().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
