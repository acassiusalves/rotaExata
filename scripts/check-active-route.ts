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
  const routesSnapshot = await db.collection('routes')
    .where('serviceId', '==', 'lr6gYhurz6ECL8ooxn8k')
    .get();

  console.log('Encontradas rotas:', routesSnapshot.size);

  for (const routeDoc of routesSnapshot.docs) {
    const routeData = routeDoc.data();
    console.log('\nRota:', routeDoc.id);
    console.log('Código:', routeData.code);
    console.log('Stops:', routeData.stops?.length || 0);

    if (routeData.stops && routeData.stops.length > 0) {
      const firstStop = routeData.stops[0];
      console.log('\nPrimeiro stop:');
      console.log('Cliente:', firstStop.customerName);
      console.log('Pedido:', firstStop.orderNumber);
      console.log('rua:', firstStop.rua || 'NAO TEM');
      console.log('numero:', firstStop.numero || 'NAO TEM');
      console.log('bairro:', firstStop.bairro || 'NAO TEM');
      console.log('cidade:', firstStop.cidade || 'NAO TEM');
      console.log('cep:', firstStop.cep || 'NAO TEM');
      console.log('street:', firstStop.street || 'NAO TEM');
      console.log('neighborhood:', firstStop.neighborhood || 'NAO TEM');
    }
  }
}

checkRoute().then(() => process.exit(0)).catch(console.error);
