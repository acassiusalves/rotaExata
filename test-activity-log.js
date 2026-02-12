/**
 * Script de teste para verificar o sistema de Activity Log
 *
 * Este script:
 * 1. Verifica se há atividades na coleção activity_log
 * 2. Lista as últimas 10 atividades
 * 3. Mostra estatísticas por tipo de evento
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Inicializar Firebase Admin usando variáveis de ambiente
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Variáveis de ambiente Firebase não encontradas!');
  console.log('   Certifique-se de ter FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey
  }),
  projectId: projectId
});

const db = admin.firestore();

async function testActivityLog() {
  console.log('🔍 Verificando Activity Log...\n');

  try {
    // 1. Contar total de atividades
    const snapshot = await db.collection('activity_log')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    console.log(`📊 Total de atividades (últimas 100): ${snapshot.size}\n`);

    if (snapshot.empty) {
      console.log('⚠️  Nenhuma atividade encontrada na coleção activity_log');
      console.log('   Isso pode indicar que:');
      console.log('   - As atividades não estão sendo registradas');
      console.log('   - A coleção está vazia\n');
      return;
    }

    // 2. Listar últimas 10 atividades
    console.log('📝 Últimas 10 atividades:\n');
    let count = 0;
    snapshot.forEach(doc => {
      if (count < 10) {
        const data = doc.data();
        console.log(`${count + 1}. [${data.eventType}] ${data.action}`);
        console.log(`   Usuário: ${data.userName || 'N/A'}`);
        console.log(`   Timestamp: ${data.timestamp?.toDate().toLocaleString('pt-BR') || 'N/A'}`);
        console.log(`   Entity: ${data.entityType} (${data.entityCode || 'N/A'})\n`);
        count++;
      }
    });

    // 3. Estatísticas por tipo de evento
    console.log('📈 Estatísticas por tipo de evento:\n');
    const eventTypes = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      eventTypes[data.eventType] = (eventTypes[data.eventType] || 0) + 1;
    });

    Object.entries(eventTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });

    console.log('\n✅ Teste concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao testar activity log:', error);
    if (error.code === 'failed-precondition') {
      console.log('\n⚠️  Erro de índice detectado!');
      console.log('   Execute: firebase deploy --only firestore:indexes');
    }
  } finally {
    process.exit(0);
  }
}

testActivityLog();
