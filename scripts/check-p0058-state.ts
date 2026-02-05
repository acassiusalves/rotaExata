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
  // Verificar rota LNS-0001-D
  const routeDoc = await db.collection('routes').doc('wl3LNBnMj0LE5WoRwQ0S').get();
  const data = routeDoc.data()!;
  console.log('=== ROTA LNS-0001-D ===');
  console.log('unassignedStops:', (data.unassignedStops || []).length);
  (data.unassignedStops || []).forEach((s: any) => {
    console.log('  -', s.orderNumber, s.customerName, '| lat:', s.lat, '| lng:', s.lng, '| address:', s.address?.substring(0, 60));
  });
  console.log('stops:', (data.stops || []).length);
  (data.stops || []).forEach((s: any) => {
    console.log('  -', s.orderNumber, s.customerName, '| lat:', s.lat, '| lng:', s.lng);
  });

  // Verificar serviço LNS-0001
  const serviceDoc = await db.collection('services').doc('UjqDxtRNscixbOBjJ6Hy').get();
  const sData = serviceDoc.data()!;
  console.log('\n=== SERVICO LNS-0001 ===');
  console.log('allStops:', (sData.allStops || []).length);
  const allStops = sData.allStops || [];
  allStops.forEach((s: any) => {
    console.log('  -', s.orderNumber, s.customerName, '| lat:', s.lat, '| lng:', s.lng);
  });

  // Verificar order P0058
  console.log('\n=== ORDER P0058 ===');
  const ordersSnap = await db.collection('orders').where('number', '==', 'P0058').get();
  for (const orderDoc of ordersSnap.docs) {
    const o = orderDoc.data();
    console.log('ID:', orderDoc.id);
    console.log('logisticsStatus:', o.logisticsStatus);
    console.log('rotaExataRouteId:', o.rotaExataRouteId);
    console.log('rotaExataServiceId:', o.rotaExataServiceId);
    console.log('deliveryAddress:', JSON.stringify(o.deliveryAddress));
  }
}

check().catch(console.error);
