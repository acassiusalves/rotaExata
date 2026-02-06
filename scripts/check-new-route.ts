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

async function checkRoute() {
  // Buscar serviço
  const serviceDoc = await db.collection('services').doc('HT3ZcOdnfloIoYpOox0q').get();

  if (!serviceDoc.exists) {
    console.log('Serviço não encontrado!');
    return;
  }

  const serviceData = serviceDoc.data()!;
  console.log('\nServiço:', serviceData.code);
  console.log('allStops:', serviceData.allStops?.length || 0);

  if (serviceData.allStops && serviceData.allStops.length > 0) {
    const firstStop = serviceData.allStops[0];
    console.log('\nPrimeiro stop do serviço:');
    console.log('Cliente:', firstStop.customerName);
    console.log('Pedido:', firstStop.orderNumber);
    console.log('address:', firstStop.address?.substring(0, 50) || 'NAO TEM');
    console.log('rua:', firstStop.rua || 'NAO TEM');
    console.log('numero:', firstStop.numero || 'NAO TEM');
    console.log('bairro:', firstStop.bairro || 'NAO TEM');
    console.log('cidade:', firstStop.cidade || 'NAO TEM');
    console.log('cep:', firstStop.cep || 'NAO TEM');
  }

  // Buscar rotas do serviço
  const routesSnapshot = await db.collection('routes')
    .where('serviceId', '==', 'HT3ZcOdnfloIoYpOox0q')
    .get();

  console.log('\n\nRotas encontradas:', routesSnapshot.size);

  for (const routeDoc of routesSnapshot.docs) {
    const routeData = routeDoc.data();
    console.log('\nRota:', routeData.code);
    console.log('Stops:', routeData.stops?.length || 0);

    if (routeData.stops && routeData.stops.length > 0) {
      const firstStop = routeData.stops[0];
      console.log('\nPrimeiro stop da rota:');
      console.log('Cliente:', firstStop.customerName);
      console.log('Pedido:', firstStop.orderNumber);
      console.log('address:', firstStop.address?.substring(0, 50) || 'NAO TEM');
      console.log('rua:', firstStop.rua || 'NAO TEM');
      console.log('numero:', firstStop.numero || 'NAO TEM');
      console.log('bairro:', firstStop.bairro || 'NAO TEM');
      console.log('cidade:', firstStop.cidade || 'NAO TEM');
      console.log('cep:', firstStop.cep || 'NAO TEM');
    }
  }
}

checkRoute().then(() => process.exit(0)).catch(console.error);
