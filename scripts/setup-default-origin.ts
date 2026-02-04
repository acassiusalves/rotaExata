/**
 * Script para configurar a origem padrão do sistema
 *
 * Este script cria/atualiza o documento settings/defaultOrigin no Firestore
 * que é usado como origem padrão para rotas importadas do Luna.
 *
 * Execução: npx tsx scripts/setup-default-origin.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

// Inicializar Firebase Admin SDK
if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase não encontradas no .env.local');
    console.error('Certifique-se de que FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY estão configurados.');
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

// Origem padrão Sol de Maria
const DEFAULT_ORIGIN = {
  id: 'default-origin-sol-de-maria',
  customerName: 'Sol de Maria',
  address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
  placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
  lat: -16.6786,
  lng: -49.2552,
  phone: '',
};

async function setupDefaultOrigin() {
  console.log('Configurando origem padrão do sistema...\n');

  try {
    // Verificar se já existe configuração
    const settingsDoc = await db.collection('settings').doc('defaultOrigin').get();

    if (settingsDoc.exists) {
      const existingData = settingsDoc.data();
      console.log('Configuração atual encontrada:');
      console.log(`   Endereço: ${existingData?.origin?.address || 'Não definido'}`);
      console.log(`   Coordenadas: lat=${existingData?.origin?.lat}, lng=${existingData?.origin?.lng}`);
      console.log('');
    }

    // Criar/atualizar documento de configuração
    await db.collection('settings').doc('defaultOrigin').set({
      origin: DEFAULT_ORIGIN,
      updatedAt: new Date(),
    });

    console.log('Origem padrão configurada com sucesso!');
    console.log(`   Nome: ${DEFAULT_ORIGIN.customerName}`);
    console.log(`   Endereço: ${DEFAULT_ORIGIN.address}`);
    console.log(`   Coordenadas: lat=${DEFAULT_ORIGIN.lat}, lng=${DEFAULT_ORIGIN.lng}`);
    console.log('');

    // Verificar se foi salvo corretamente
    const verifyDoc = await db.collection('settings').doc('defaultOrigin').get();
    if (verifyDoc.exists) {
      console.log('Verificação: Documento salvo corretamente no Firestore.');
    } else {
      console.error('ERRO: Documento não foi encontrado após salvar!');
    }

  } catch (error) {
    console.error('Erro ao configurar origem padrão:', error);
    process.exit(1);
  }
}

// Executar configuração
setupDefaultOrigin()
  .then(() => {
    console.log('\nScript finalizado com sucesso!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
