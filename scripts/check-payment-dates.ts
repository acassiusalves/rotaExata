/**
 * Script para verificar campos de data nos pagamentos
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

async function checkPaymentDates() {
  console.log('🔍 Verificando campos de data nos pagamentos...\n');

  try {
    const paymentsSnapshot = await db.collection('driverPayments').get();

    console.log(`📊 Analisando ${paymentsSnapshot.size} pagamentos:\n`);

    // Procurar pagamentos com data específica (04/02/2026)
    const targetDate = new Date(2026, 1, 4); // mês 1 = fevereiro
    targetDate.setHours(0, 0, 0, 0);

    const paymentsOnDate = paymentsSnapshot.docs.filter((doc) => {
      const payment = doc.data();
      if (payment.routePlannedDate && payment.routePlannedDate.seconds) {
        const paymentDate = new Date(payment.routePlannedDate.seconds * 1000);
        paymentDate.setHours(0, 0, 0, 0);
        return paymentDate.getTime() === targetDate.getTime();
      }
      return false;
    });

    console.log(`🔍 Pagamentos com data 04/02/2026: ${paymentsOnDate.length}`);

    if (paymentsOnDate.length > 0) {
      console.log('\nDetalhes dos pagamentos:');
      paymentsOnDate.forEach((doc, index) => {
        const payment = doc.data();
        console.log(`\n${index + 1}. Pagamento: ${payment.routeCode || doc.id}`);
        console.log(`   - routePlannedDate: ${formatDate(payment.routePlannedDate)}`);
        console.log(`   - driverName: ${payment.driverName || 'NULL'}`);
      });
    }

    let paymentIndex = 0;
    paymentsSnapshot.docs.slice(0, 10).forEach((doc) => {
      paymentIndex++;
      const payment = doc.data();
      console.log(`\n${paymentIndex}. Pagamento: ${payment.routeCode || doc.id}`);
      console.log(`   - routePlannedDate: ${payment.routePlannedDate ? formatDate(payment.routePlannedDate) : 'NULL'}`);
      console.log(`   - routeCompletedAt: ${payment.routeCompletedAt ? formatDate(payment.routeCompletedAt) : 'NULL'}`);
      console.log(`   - routeCreatedAt: ${payment.routeCreatedAt ? formatDate(payment.routeCreatedAt) : 'NULL'}`);
      console.log(`   - createdAt: ${payment.createdAt ? formatDate(payment.createdAt) : 'NULL'}`);
      console.log(`   - driverId: ${payment.driverId || 'NULL'}`);
      console.log(`   - driverName: ${payment.driverName || 'NULL'}`);
    });

    console.log('\n\n' + '='.repeat(60));
    console.log('RESUMO:');
    console.log('='.repeat(60));

    const withRoutePlannedDate = paymentsSnapshot.docs.filter(d => d.data().routePlannedDate).length;
    const withRouteCompletedAt = paymentsSnapshot.docs.filter(d => d.data().routeCompletedAt).length;
    const withRouteCreatedAt = paymentsSnapshot.docs.filter(d => d.data().routeCreatedAt).length;
    const withDriverId = paymentsSnapshot.docs.filter(d => d.data().driverId).length;

    console.log(`Pagamentos com routePlannedDate: ${withRoutePlannedDate}/${paymentsSnapshot.size}`);
    console.log(`Pagamentos com routeCompletedAt: ${withRouteCompletedAt}/${paymentsSnapshot.size}`);
    console.log(`Pagamentos com routeCreatedAt: ${withRouteCreatedAt}/${paymentsSnapshot.size}`);
    console.log(`Pagamentos com driverId: ${withDriverId}/${paymentsSnapshot.size}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  }
}

function formatDate(timestamp: any): string {
  if (!timestamp) return 'NULL';

  try {
    // Se tem o método toDate (Firestore Timestamp)
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      const date = timestamp.toDate();
      return date.toLocaleDateString('pt-BR');
    }

    // Se é um objeto com seconds (formato do Admin SDK)
    if (timestamp.seconds) {
      const date = new Date(timestamp.seconds * 1000);
      return date.toLocaleDateString('pt-BR');
    }

    // Se é uma string ou número
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  } catch {
    return 'INVALID';
  }
}

checkPaymentDates()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro na verificação:', error);
    process.exit(1);
  });
