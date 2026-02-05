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
  const routeIds = ['bwplB7xQ9eyAvaduR0dq', 'kcG9oiyOZgpfsaGekYTZ'];

  for (const id of routeIds) {
    const docSnap = await db.collection('routes').doc(id).get();
    const data = docSnap.data()!;
    console.log(`\n=== ${data.code || data.name} (${id}) ===`);
    console.log('  status:', data.status);
    console.log('  serviceId:', data.serviceId);
    console.log('  stops:', (data.stops || []).length);
    console.log('  stops orders:', (data.stops || []).map((s: any) => s.orderNumber).join(', '));
    console.log('  unassignedStops:', (data.unassignedStops || []).length);
    if ((data.unassignedStops || []).length > 0) {
      console.log('  unassigned orders:', (data.unassignedStops || []).map((s: any) => s.orderNumber).join(', '));
    }
    console.log('  lunnaOrderIds:', JSON.stringify(data.lunnaOrderIds || []));
  }

  // Verificar serviço
  const svcSnap = await db.collection('services').doc('BoQtPJZXkG9jtiE83cPp').get();
  const svcData = svcSnap.data()!;
  console.log('\n=== Serviço LNS-0002 ===');
  console.log('  allStops:', (svcData.allStops || []).length);
  console.log('  allStops orders:', (svcData.allStops || []).map((s: any) => s.orderNumber).join(', '));

  // Verificar se há pedidos recentes com rotaExataRouteId apontando para estas rotas
  console.log('\n=== Pedidos recentes vinculados ===');
  for (const id of routeIds) {
    const ordersSnap = await db.collection('orders')
      .where('rotaExataRouteId', '==', id)
      .get();
    if (ordersSnap.size > 0) {
      for (const oDoc of ordersSnap.docs) {
        const oData = oDoc.data();
        console.log(`  ${oData.number} → rota ${id} | logisticsStatus: ${oData.logisticsStatus} | updatedAt: ${oData.updatedAt?.toDate?.() || 'N/A'}`);
      }
    }
  }
}

check().catch(console.error);
