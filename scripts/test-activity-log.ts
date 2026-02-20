/**
 * Script para criar um documento de teste na coleção activity_log
 * Uso: npx ts-node scripts/test-activity-log.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Inicializar Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);

async function createTestActivity() {
  try {
    console.log('Criando atividade de teste...');

    const docRef = await db.collection('activity_log').add({
      timestamp: Timestamp.now(),
      eventType: 'route_created',
      category: 'LIFECYCLE',
      userId: 'test-user',
      userName: 'Usuário Teste',
      userRole: 'admin',
      origin: 'web_admin',
      entityType: 'route',
      entityId: 'test-route-123',
      entityCode: 'ROTA-001',
      serviceId: 'test-service-123',
      serviceCode: 'SVC-001',
      routeId: 'test-route-123',
      routeCode: 'ROTA-001',
      action: 'Criou a rota ROTA-001',
      isSystemGenerated: false,
    });

    console.log('✅ Atividade de teste criada com ID:', docRef.id);

    // Verificar se conseguimos ler de volta
    const testDoc = await docRef.get();
    if (testDoc.exists) {
      console.log('✅ Documento lido com sucesso:', testDoc.data());
    } else {
      console.error('❌ Documento não encontrado após criação');
    }

    // Listar documentos
    const snapshot = await db.collection('activity_log').limit(5).get();
    console.log(`\n📊 Total de documentos em activity_log: ${snapshot.size}`);

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`\n${index + 1}. ${doc.id}`);
      console.log(`   Evento: ${data.eventType}`);
      console.log(`   Usuário: ${data.userName}`);
      console.log(`   Ação: ${data.action}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

createTestActivity();
