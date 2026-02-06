import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  const formattedKey = privateKey!.replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: projectId!,
      clientEmail: clientEmail!,
      privateKey: formattedKey,
    }),
    projectId: projectId,
  });
}

const db = getFirestore();

async function fixService() {
  console.log('🔄 Corrigindo serviço LNS-0006...\n');

  // 1. Buscar serviço
  const serviceDoc = await db.collection('services').doc('HT3ZcOdnfloIoYpOox0q').get();
  if (!serviceDoc.exists) {
    console.log('❌ Serviço não encontrado');
    return;
  }

  const serviceData = serviceDoc.data()!;
  const allStops = serviceData.allStops || [];

  console.log(`📦 Serviço: ${serviceData.code}`);
  console.log(`📍 Total de stops: ${allStops.length}\n`);

  // 2. Para cada stop, buscar dados do cliente
  const updatedStops = [];

  for (const stop of allStops) {
    console.log(`Processando: ${stop.customerName} (Pedido: ${stop.orderNumber})`);

    // Buscar pedido para pegar o cliente ID
    const orderSnapshot = await db.collection('orders')
      .where('number', '==', stop.orderNumber)
      .limit(1)
      .get();

    if (orderSnapshot.empty) {
      console.log(`  ⚠️  Pedido ${stop.orderNumber} não encontrado, mantendo dados atuais`);
      updatedStops.push(stop);
      continue;
    }

    const orderData = orderSnapshot.docs[0].data();
    const clientId = orderData.client.id;

    // Buscar dados do cliente
    const clientDoc = await db.collection('clientes').doc(clientId).get();

    if (!clientDoc.exists) {
      console.log(`  ⚠️  Cliente ${clientId} não encontrado, mantendo dados atuais`);
      updatedStops.push(stop);
      continue;
    }

    const clientData = clientDoc.data()!;

    // Atualizar stop com dados do cliente (substituir undefined por string vazia)
    const updatedStop = {
      ...stop,
      rua: clientData.rua || '',
      numero: clientData.numero || '',
      bairro: clientData.bairro || '',
      cidade: clientData.cidade || '',
      cep: clientData.cep || '',
    };

    console.log(`  ✅ Atualizado: rua=${clientData.rua}, numero=${clientData.numero}`);
    updatedStops.push(updatedStop);
  }

  // 3. Atualizar serviço
  await serviceDoc.ref.update({
    allStops: updatedStops,
    updatedAt: new Date(),
  });

  console.log(`\n✅ Serviço ${serviceData.code} atualizado!\n`);

  // 4. Atualizar rotas também
  const routesSnapshot = await db.collection('routes')
    .where('serviceId', '==', 'HT3ZcOdnfloIoYpOox0q')
    .get();

  console.log(`🔄 Atualizando ${routesSnapshot.size} rotas...\n`);

  for (const routeDoc of routesSnapshot.docs) {
    const routeData = routeDoc.data();
    const stops = routeData.stops || [];

    const updatedRouteStops = [];

    for (const stop of stops) {
      // Buscar pedido
      const orderSnapshot = await db.collection('orders')
        .where('number', '==', stop.orderNumber)
        .limit(1)
        .get();

      if (orderSnapshot.empty) {
        updatedRouteStops.push(stop);
        continue;
      }

      const orderData = orderSnapshot.docs[0].data();
      const clientDoc = await db.collection('clientes').doc(orderData.client.id).get();

      if (!clientDoc.exists) {
        updatedRouteStops.push(stop);
        continue;
      }

      const clientData = clientDoc.data()!;

      updatedRouteStops.push({
        ...stop,
        rua: clientData.rua || '',
        numero: clientData.numero || '',
        bairro: clientData.bairro || '',
        cidade: clientData.cidade || '',
        cep: clientData.cep || '',
      });
    }

    await routeDoc.ref.update({
      stops: updatedRouteStops,
      updatedAt: new Date(),
    });

    console.log(`  ✅ Rota ${routeData.code} atualizada`);
  }

  console.log('\n🎉 Concluído! Todos os stops foram atualizados com dados dos clientes.\n');
}

fixService().then(() => process.exit(0)).catch(console.error);
