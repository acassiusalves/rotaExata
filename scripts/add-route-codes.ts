/**
 * Script de Migração: Adiciona códigos sequenciais a todas as rotas existentes
 *
 * Este script:
 * 1. Busca todas as rotas que não possuem código
 * 2. Gera códigos sequenciais únicos para cada uma
 * 3. Atualiza as rotas no Firestore
 *
 * Execute com: npx tsx scripts/add-route-codes.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, runTransaction, query, orderBy } from 'firebase/firestore';

// Configuração do Firebase (ajuste conforme necessário)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function generateRouteCode(): Promise<string> {
  const counterRef = doc(db, 'counters', 'routeCode');

  const newCount = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let currentCount = 0;
    if (counterDoc.exists()) {
      currentCount = counterDoc.data().count || 0;
    }

    const nextCount = currentCount + 1;
    transaction.set(counterRef, { count: nextCount }, { merge: true });

    return nextCount;
  });

  return `RT-${String(newCount).padStart(4, '0')}`;
}

async function addCodesToExistingRoutes() {
  console.log('🚀 Iniciando migração de códigos de rotas...\n');

  try {
    // Buscar todas as rotas ordenadas por data de criação
    const routesRef = collection(db, 'routes');
    const q = query(routesRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);

    console.log(`📊 Total de rotas encontradas: ${snapshot.size}`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const routeDoc of snapshot.docs) {
      const routeData = routeDoc.data();

      // Verificar se a rota já tem código
      if (routeData.code) {
        console.log(`⏭️  Rota ${routeDoc.id} já possui código: ${routeData.code}`);
        skippedCount++;
        continue;
      }

      // Gerar novo código
      const newCode = await generateRouteCode();

      // Atualizar a rota
      await updateDoc(doc(db, 'routes', routeDoc.id), {
        code: newCode,
      });

      console.log(`✅ Rota ${routeDoc.id} (${routeData.name || 'Sem nome'}) atualizada com código: ${newCode}`);
      updatedCount++;

      // Pequeno delay para evitar sobrecarga
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 Migração concluída!');
    console.log(`📝 Rotas atualizadas: ${updatedCount}`);
    console.log(`⏭️  Rotas ignoradas (já tinham código): ${skippedCount}`);
    console.log(`📊 Total processado: ${snapshot.size}`);

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  }
}

// Executar o script
addCodesToExistingRoutes()
  .then(() => {
    console.log('\n✨ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
