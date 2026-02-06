/**
 * Script para migrar campos de endereço dos stops existentes
 *
 * Este script adiciona os campos estruturados (street, neighborhood, city, state, zipCode)
 * aos stops que foram importados antes da implementação desses campos.
 *
 * Execução: npx tsx scripts/migrate-address-fields.ts
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

/**
 * Extrai campos estruturados de um endereço formatado
 */
function parseAddress(address: string, complemento?: string): {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
} {
  // Exemplo de endereço: "Av. Iguatemi - Parque Itália, Aparecida de Goiânia - GO, 74968-740, Brasil"

  // Remover ", Brasil" do final
  const cleanAddress = address.replace(/, Brasil$/, '');

  // Dividir por vírgulas
  const parts = cleanAddress.split(',').map(p => p.trim());

  const result: any = {};

  if (parts.length >= 1) {
    // Primeira parte: Rua e possivelmente bairro
    const firstPart = parts[0];

    // Tentar separar rua de bairro pelo " - "
    if (firstPart.includes(' - ')) {
      const [streetPart, neighborhoodPart] = firstPart.split(' - ');
      result.street = streetPart.trim();
      result.neighborhood = neighborhoodPart.trim();
    } else {
      result.street = firstPart;
    }
  }

  if (parts.length >= 2) {
    // Segunda parte: Cidade - Estado
    const secondPart = parts[1];

    if (secondPart.includes(' - ')) {
      const [cityPart, statePart] = secondPart.split(' - ');
      result.city = cityPart.trim();
      result.state = statePart.trim();
    } else {
      result.city = secondPart;
    }
  }

  if (parts.length >= 3) {
    // Terceira parte: CEP
    result.zipCode = parts[2].trim();
  }

  // Se não encontrou neighborhood na primeira parte, tenta na segunda
  if (!result.neighborhood && parts.length >= 2 && !parts[1].includes(' - ')) {
    result.neighborhood = parts[1];
    if (parts.length >= 3) {
      result.city = parts[2];
    }
  }

  return result;
}

async function migrateAddressFields() {
  console.log('🔄 Iniciando migração de campos de endereço...\n');

  try {
    // Buscar rotas do serviço LNS-0004
    const routesSnapshot = await db.collection('routes')
      .where('serviceId', '==', 'lsJlk5OB8DEQt9DLsfyY')
      .get();

    console.log(`📋 Encontradas ${routesSnapshot.size} rotas\n`);

    let totalStopsMigrated = 0;
    let totalStopsSkipped = 0;

    for (const routeDoc of routesSnapshot.docs) {
      const routeData = routeDoc.data();
      const routeCode = routeData.code || routeDoc.id;
      const stops = routeData.stops || [];

      console.log(`\n📍 Processando rota ${routeCode}...`);
      console.log(`   Stops: ${stops.length}`);

      if (stops.length === 0) {
        console.log('   ⏭️  Pulando (sem stops)');
        continue;
      }

      const updatedStops = stops.map((stop: any) => {
        // Se já tem os campos estruturados, pular
        if (stop.street && stop.neighborhood && stop.city) {
          totalStopsSkipped++;
          return stop;
        }

        // Extrair campos do endereço
        const address = stop.address || stop.addressString || '';
        const parsed = parseAddress(address, stop.complemento);

        totalStopsMigrated++;

        return {
          ...stop,
          ...parsed,
        };
      });

      // Atualizar rota com stops migrados
      await db.collection('routes').doc(routeDoc.id).update({
        stops: updatedStops,
        updatedAt: new Date(),
      });

      console.log(`   ✅ ${totalStopsMigrated} stops migrados`);
    }

    // Também migrar unassignedStops se existirem
    for (const routeDoc of routesSnapshot.docs) {
      const routeData = routeDoc.data();
      const unassignedStops = routeData.unassignedStops || [];

      if (unassignedStops.length > 0) {
        const updatedUnassigned = unassignedStops.map((stop: any) => {
          if (stop.street && stop.neighborhood && stop.city) {
            return stop;
          }

          const address = stop.address || stop.addressString || '';
          const parsed = parseAddress(address, stop.complemento);

          return {
            ...stop,
            ...parsed,
          };
        });

        await db.collection('routes').doc(routeDoc.id).update({
          unassignedStops: updatedUnassigned,
          updatedAt: new Date(),
        });
      }
    }

    console.log('\n========================================');
    console.log('✅ Migração concluída!');
    console.log(`   Stops migrados: ${totalStopsMigrated}`);
    console.log(`   Stops já tinham campos: ${totalStopsSkipped}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  }
}

migrateAddressFields()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
