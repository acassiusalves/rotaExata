import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials');
  process.exit(1);
}

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

async function check() {
  const routeId = 'wl3LNBnMj0LE5WoRwQ0S'; // LNS-0001-D
  const routeDoc = await db.collection('routes').doc(routeId).get();
  const data = routeDoc.data()!;

  console.log('=== TODOS OS STOPS DA ROTA LNS-0001-D ===');
  const stops = data.stops || [];
  stops.forEach((s: any, i: number) => {
    console.log(`\nStop ${i + 1}:`);
    console.log('  orderNumber:', s.orderNumber);
    console.log('  customerName:', s.customerName);
    console.log('  address:', s.address);
    console.log('  lat:', s.lat);
    console.log('  lng:', s.lng);
    console.log('  id:', s.id);
    console.log('  placeId:', s.placeId);
  });

  // Verificar o order P0042 no collection orders
  console.log('\n=== ORDER P0042 no Firestore ===');
  const ordersSnap = await db.collection('orders').where('number', '==', 'P0042').get();
  for (const orderDoc of ordersSnap.docs) {
    const oData = orderDoc.data();
    console.log('Order ID:', orderDoc.id);
    console.log('  number:', oData.number);
    console.log('  customerName:', oData.customerName);
    console.log('  logisticsStatus:', oData.logisticsStatus);
    console.log('  rotaExataRouteId:', oData.rotaExataRouteId);
    console.log('  rotaExataServiceId:', oData.rotaExataServiceId);
    console.log('  deliveryAddress:', JSON.stringify(oData.deliveryAddress));
  }
}

check().catch(console.error);
