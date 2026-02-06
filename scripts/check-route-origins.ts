/**
 * Script para verificar as origens das rotas
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase não encontradas');
    process.exit(1);
  }

  const formattedKey = privateKey.replace(/\\n/g, '\n');

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: formattedKey,
    }),
    projectId: projectId,
  });
}

const db = getFirestore();

const DEFAULT_ORIGIN = {
  id: 'default-origin-sol-de-maria',
  address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
  placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
  lat: -16.6786,
  lng: -49.2552,
};

async function checkRouteOrigins() {
  console.log('Verificando origens das rotas...\n');

  try {
    // Buscar rotas do serviço LNS-0004
    const routesSnapshot = await db.collection('routes')
      .where('serviceId', '==', 'lsJlk5OB8DEQt9DLsfyY')
      .get();

    console.log(`Encontradas ${routesSnapshot.size} rotas do serviço LNS-0004\n`);

    for (const routeDoc of routesSnapshot.docs) {
      const routeData = routeDoc.data();
      const routeCode = routeData.code || routeDoc.id;
      const origin = routeData.origin;

      console.log(`\n=== Rota: ${routeCode} ===`);
      console.log(`ID: ${routeDoc.id}`);
      console.log(`Nome: ${routeData.name || 'N/A'}`);
      console.log(`Status: ${routeData.status || 'N/A'}`);
      console.log(`Stops: ${(routeData.stops || []).length}`);

      if (origin) {
        console.log(`\nOrigem atual:`);
        console.log(`  Endereço: ${origin.address || 'N/A'}`);
        console.log(`  Lat: ${origin.lat}`);
        console.log(`  Lng: ${origin.lng}`);

        const isCorrect = Math.abs(origin.lat - DEFAULT_ORIGIN.lat) < 0.001 &&
                         Math.abs(origin.lng - DEFAULT_ORIGIN.lng) < 0.001;

        if (isCorrect) {
          console.log(`  ✅ Origem CORRETA (Sol de Maria)`);
        } else {
          console.log(`  ❌ Origem INCORRETA`);
          console.log(`  Deveria ser: ${DEFAULT_ORIGIN.address}`);
          console.log(`  Lat esperado: ${DEFAULT_ORIGIN.lat}`);
          console.log(`  Lng esperado: ${DEFAULT_ORIGIN.lng}`);
        }
      } else {
        console.log(`❌ SEM ORIGEM!`);
      }
    }

  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

checkRouteOrigins()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
