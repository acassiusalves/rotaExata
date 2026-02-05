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
  // Check service LNS-0001
  const servicesSnap = await db.collection('services').where('code', '==', 'LNS-0001').get();
  if (servicesSnap.empty) {
    console.log('Service LNS-0001 not found');
    return;
  }
  const serviceDoc = servicesSnap.docs[0];
  const serviceData = serviceDoc.data();
  console.log('=== SERVICE LNS-0001 ===');
  console.log('ID:', serviceDoc.id);
  console.log('Status:', serviceData.status);
  console.log('allStops count:', serviceData.allStops?.length || 0);
  console.log('allStops orderNumbers:', serviceData.allStops?.map((s: any) => s.orderNumber));
  console.log('lunnaOrderIds:', serviceData.lunnaOrderIds);
  console.log('routeIds:', serviceData.routeIds);

  // Check routes for this service
  const routesSnap = await db.collection('routes').where('serviceId', '==', serviceDoc.id).get();
  console.log('\n=== ROUTES for this service ===');
  for (const routeDoc of routesSnap.docs) {
    const data = routeDoc.data();
    console.log(`\nRoute: ${routeDoc.id}`);
    console.log('  Status:', data.status);
    console.log('  Code:', data.code);
    console.log('  Name:', data.name);
    console.log('  Stops count:', data.stops?.length || 0);
    console.log('  Stops orderNumbers:', data.stops?.map((s: any) => s.orderNumber));
    console.log('  unassignedStops count:', data.unassignedStops?.length || 0);
    if (data.unassignedStops && data.unassignedStops.length > 0) {
      console.log('  unassignedStops:', data.unassignedStops.map((s: any) => ({
        id: s.id,
        orderNumber: s.orderNumber,
        customerName: s.customerName,
      })));
    }
    console.log('  driverId:', data.driverId || 'none');
    console.log('  lunnaOrderIds:', data.lunnaOrderIds);
  }

  // Check all recent orders that reference LNS-0001
  console.log('\n=== ORDERS referencing this service ===');
  const ordersByService = await db.collection('orders')
    .where('rotaExataServiceId', '==', serviceDoc.id)
    .get();
  for (const orderDoc of ordersByService.docs) {
    const data = orderDoc.data();
    console.log(`Order ${data.number}: logisticsStatus=${data.logisticsStatus}, routeId=${data.rotaExataRouteId || 'none'}`);
  }

  // Also check if any orders reference the route IDs directly
  const routeIds = routesSnap.docs.map(d => d.id);
  if (routeIds.length > 0) {
    console.log('\n=== ORDERS referencing routes directly ===');
    for (const routeId of routeIds) {
      const ordersByRoute = await db.collection('orders')
        .where('rotaExataRouteId', '==', routeId)
        .get();
      for (const orderDoc of ordersByRoute.docs) {
        const data = orderDoc.data();
        console.log(`Order ${data.number}: routeId=${routeId}, logisticsStatus=${data.logisticsStatus}`);
      }
    }
  }
}

check().catch(console.error);
