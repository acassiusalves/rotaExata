/**
 * Script para contar rotas por data usando Firebase Admin SDK
 * Execute com: npx tsx scripts/count-routes-by-date.ts
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Credenciais do Firebase não encontradas no .env.local');
  console.error('Verifique se FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY estão definidas');
  process.exit(1);
}

// Inicializar Firebase Admin
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

async function countRoutesByDate() {
  console.log('🔍 Buscando todas as rotas para análise...\n');

  // Buscar TODAS as rotas para entender a estrutura
  const allRoutesSnapshot = await db.collection('routes').get();

  console.log(`📊 Total de rotas na coleção: ${allRoutesSnapshot.size}\n`);

  if (allRoutesSnapshot.size === 0) {
    console.log('Nenhuma rota encontrada na coleção.');
    return;
  }

  // Analisar campos de data disponíveis
  const routesByCreatedAt: Record<string, number> = {};
  const routesByPlannedDate: Record<string, number> = {};
  let routesWithoutCreatedAt = 0;
  let routesWithoutPlannedDate = 0;

  console.log('Analisando estrutura das rotas...\n');

  allRoutesSnapshot.forEach((doc) => {
    const data = doc.data();

    // Verificar createdAt
    if (data.createdAt) {
      const date = data.createdAt.toDate();
      const dayKey = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      routesByCreatedAt[dayKey] = (routesByCreatedAt[dayKey] || 0) + 1;
    } else {
      routesWithoutCreatedAt++;
    }

    // Verificar plannedDate
    if (data.plannedDate) {
      let date: Date;
      if (data.plannedDate.toDate) {
        date = data.plannedDate.toDate();
      } else if (typeof data.plannedDate === 'string') {
        date = new Date(data.plannedDate);
      } else {
        date = new Date(data.plannedDate);
      }
      const dayKey = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      routesByPlannedDate[dayKey] = (routesByPlannedDate[dayKey] || 0) + 1;
    } else {
      routesWithoutPlannedDate++;
    }
  });

  // Mostrar rotas por createdAt
  console.log('📅 ROTAS POR DATA DE CRIAÇÃO (createdAt):');
  console.log('==========================================');
  if (Object.keys(routesByCreatedAt).length > 0) {
    Object.entries(routesByCreatedAt).sort().forEach(([day, count]) => {
      console.log(`  ${day}: ${count} rotas`);
    });
  } else {
    console.log('  Nenhuma rota com campo createdAt');
  }
  if (routesWithoutCreatedAt > 0) {
    console.log(`  ⚠️  ${routesWithoutCreatedAt} rotas sem campo createdAt`);
  }

  // Mostrar rotas por plannedDate
  console.log('\n📅 ROTAS POR DATA PLANEJADA (plannedDate):');
  console.log('==========================================');
  if (Object.keys(routesByPlannedDate).length > 0) {
    Object.entries(routesByPlannedDate).sort().forEach(([day, count]) => {
      console.log(`  ${day}: ${count} rotas`);
    });
  } else {
    console.log('  Nenhuma rota com campo plannedDate');
  }
  if (routesWithoutPlannedDate > 0) {
    console.log(`  ⚠️  ${routesWithoutPlannedDate} rotas sem campo plannedDate`);
  }

  // Filtrar especificamente para 11/12 e 12/12
  console.log('\n\n📊 FILTRO ESPECÍFICO: 11/12/2024 e 12/12/2024');
  console.log('==============================================');

  const targetDates = ['11/12/2024', '12/12/2024'];

  console.log('\nPor createdAt:');
  targetDates.forEach(date => {
    const count = routesByCreatedAt[date] || 0;
    console.log(`  ${date}: ${count} rotas`);
  });

  console.log('\nPor plannedDate:');
  targetDates.forEach(date => {
    const count = routesByPlannedDate[date] || 0;
    console.log(`  ${date}: ${count} rotas`);
  });
}

countRoutesByDate()
  .then(() => {
    console.log('\n✅ Consulta finalizada!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
