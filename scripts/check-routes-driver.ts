/**
 * Script para verificar se as rotas têm informações de motorista
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Credenciais do Firebase não encontradas no .env.local');
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

async function checkRoutesDriver() {
  console.log('🔍 Verificando informações de motorista nas rotas...\n');

  try {
    const routesSnapshot = await db.collection('routes').limit(10).get();

    console.log(`📊 Analisando ${routesSnapshot.size} rotas:\n`);

    let routeIndex = 0;
    routesSnapshot.docs.forEach((doc) => {
      routeIndex++;
      const route = doc.data();
      console.log(`\n${routeIndex}. Rota: ${route.routeCode || doc.id}`);
      console.log(`   - driverId: ${route.driverId || 'NULL'}`);
      console.log(`   - driverInfo: ${route.driverInfo ? 'EXISTS' : 'NULL'}`);
      if (route.driverInfo) {
        console.log(`     - driverInfo.id: ${route.driverInfo.id || 'NULL'}`);
        console.log(`     - driverInfo.name: ${route.driverInfo.name || 'NULL'}`);
      }
      console.log(`   - assignedTo: ${route.assignedTo || 'NULL'}`);
    });

    console.log('\n\n' + '='.repeat(60));
    console.log('RESUMO:');
    console.log('='.repeat(60));

    const withDriverInfo = routesSnapshot.docs.filter(d => d.data().driverInfo).length;
    const withDriverId = routesSnapshot.docs.filter(d => d.data().driverId).length;

    console.log(`Rotas com driverInfo: ${withDriverInfo}/${routesSnapshot.size}`);
    console.log(`Rotas com driverId: ${withDriverId}/${routesSnapshot.size}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  }
}

checkRoutesDriver()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro na verificação:', error);
    process.exit(1);
  });
