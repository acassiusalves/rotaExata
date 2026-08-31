/**
 * Script para diagnosticar e corrigir origem de serviços
 *
 * Este script:
 * 1. Verifica se existe settings/defaultOrigin
 * 2. Verifica a origem do serviço especificado
 * 3. Corrige a origem se estiver inválida
 *
 * Execução: npx tsx scripts/fix-service-origin.ts [serviceId]
 * Exemplo: npx tsx scripts/fix-service-origin.ts lr6gYhurz6ECL8ooxn8k
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { FALLBACK_ORIGIN } from '../src/lib/default-origin';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Credenciais do Firebase não encontradas');
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

const defaultOrigin = FALLBACK_ORIGIN;

async function fixServiceOrigin() {
  const serviceId = process.argv[2];

  if (!serviceId) {
    console.error('❌ Uso: npx tsx scripts/fix-service-origin.ts [serviceId]');
    console.error('   Exemplo: npx tsx scripts/fix-service-origin.ts lr6gYhurz6ECL8ooxn8k');
    process.exit(1);
  }

  console.log('🔍 DIAGNÓSTICO DE ORIGEM\n');
  console.log('========================================');

  // 1. Verificar settings/defaultOrigin
  console.log('\n1️⃣ Verificando settings/defaultOrigin...');
  try {
    const settingsDoc = await db.collection('settings').doc('defaultOrigin').get();

    if (settingsDoc.exists) {
      const settingsData = settingsDoc.data();
      console.log('✅ Documento settings/defaultOrigin encontrado');
      console.log('   Dados:', JSON.stringify(settingsData, null, 2));

      if (settingsData?.origin) {
        const origin = settingsData.origin;
        if (origin.lat === 0 || origin.lng === 0 || !origin.lat || !origin.lng) {
          console.log('⚠️  PROBLEMA: Origem com coordenadas inválidas!');
          console.log('   lat:', origin.lat, 'lng:', origin.lng);
        } else {
          console.log('✅ Origem válida:', origin.address);
        }
      } else {
        console.log('⚠️  PROBLEMA: Campo "origin" não encontrado no documento');
      }
    } else {
      console.log('⚠️  settings/defaultOrigin NÃO existe');
      console.log('   Será usado o fallback padrão (Sol de Maria)');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar settings/defaultOrigin:', error);
  }

  // 2. Verificar origem do serviço
  console.log('\n2️⃣ Verificando serviço', serviceId, '...');
  try {
    const serviceDoc = await db.collection('services').doc(serviceId).get();

    if (!serviceDoc.exists) {
      console.error('❌ Serviço não encontrado!');
      process.exit(1);
    }

    const serviceData = serviceDoc.data();
    console.log('✅ Serviço encontrado:', serviceData?.code);

    if (serviceData?.origin) {
      const origin = serviceData.origin;
      console.log('\n   Origem do serviço:');
      console.log('   - Endereço:', origin.address);
      console.log('   - Latitude:', origin.lat);
      console.log('   - Longitude:', origin.lng);
      console.log('   - Place ID:', origin.placeId);

      if (origin.lat === 0 || origin.lng === 0 || !origin.lat || !origin.lng) {
        console.log('\n❌ PROBLEMA ENCONTRADO: Coordenadas inválidas!');
        console.log('   A origem está com lat/lng = 0 ou vazio');

        // 3. Corrigir origem
        console.log('\n3️⃣ Corrigindo origem do serviço...');
        await db.collection('services').doc(serviceId).update({
          origin: defaultOrigin,
          updatedAt: new Date(),
        });
        console.log('✅ Origem corrigida para:', defaultOrigin.address);
        console.log('   Novas coordenadas:', defaultOrigin.lat, ',', defaultOrigin.lng);

        // 4. Corrigir rotas do serviço
        console.log('\n4️⃣ Corrigindo rotas do serviço...');
        const routesSnapshot = await db.collection('routes')
          .where('serviceId', '==', serviceId)
          .get();

        if (routesSnapshot.empty) {
          console.log('   Nenhuma rota encontrada para corrigir');
        } else {
          console.log('   Encontradas', routesSnapshot.size, 'rota(s)');

          for (const routeDoc of routesSnapshot.docs) {
            await db.collection('routes').doc(routeDoc.id).update({
              origin: defaultOrigin,
              updatedAt: new Date(),
            });
            console.log('   ✅ Rota', routeDoc.id, 'corrigida');
          }
        }

        console.log('\n========================================');
        console.log('✅ CORREÇÃO CONCLUÍDA!');
        console.log('   Origem do serviço e rotas atualizadas');
        console.log('   Recarregue a página para ver as mudanças');
        console.log('========================================\n');
      } else {
        console.log('\n✅ Origem válida! Nenhuma correção necessária.');
        console.log('   As coordenadas estão corretas.');
        console.log('\n🤔 Se o mapa ainda mostra origem errada,');
        console.log('   o problema pode estar no código do Rota Exata.');
        console.log('   Verifique se há cache ou sessionStorage armazenando');
        console.log('   dados antigos da origem.');
        console.log('========================================\n');
      }
    } else {
      console.log('\n❌ PROBLEMA ENCONTRADO: Serviço sem campo "origin"!');

      // 3. Adicionar origem
      console.log('\n3️⃣ Adicionando origem ao serviço...');
      await db.collection('services').doc(serviceId).update({
        origin: defaultOrigin,
        updatedAt: new Date(),
      });
      console.log('✅ Origem adicionada:', defaultOrigin.address);

      // 4. Corrigir rotas do serviço
      console.log('\n4️⃣ Corrigindo rotas do serviço...');
      const routesSnapshot = await db.collection('routes')
        .where('serviceId', '==', serviceId)
        .get();

      if (routesSnapshot.empty) {
        console.log('   Nenhuma rota encontrada para corrigir');
      } else {
        console.log('   Encontradas', routesSnapshot.size, 'rota(s)');

        for (const routeDoc of routesSnapshot.docs) {
          await db.collection('routes').doc(routeDoc.id).update({
            origin: defaultOrigin,
            updatedAt: new Date(),
          });
          console.log('   ✅ Rota', routeDoc.id, 'corrigida');
        }
      }

      console.log('\n========================================');
      console.log('✅ CORREÇÃO CONCLUÍDA!');
      console.log('========================================\n');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar serviço:', error);
    process.exit(1);
  }
}

fixServiceOrigin()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
