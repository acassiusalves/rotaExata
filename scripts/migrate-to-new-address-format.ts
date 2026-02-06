/**
 * Script para migrar campos de endereço antigos para o novo formato brasileiro
 *
 * Migra:
 * - street → rua (extraindo apenas o nome da rua, sem número) + numero
 * - neighborhood → bairro
 * - city → cidade
 * - zipCode → cep
 *
 * Uso: npx tsx scripts/migrate-to-new-address-format.ts
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

interface Stop {
  id?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  [key: string]: any;
}

/**
 * Extrai número da rua no formato "Rua Exemplo, 123" ou "Rua Exemplo 123"
 */
function extractStreetAndNumber(street: string): { rua: string; numero: string } {
  // Tentar extrair número no final (com ou sem vírgula)
  const match = street.match(/^(.+?),?\s*(\d+)$/);

  if (match) {
    return {
      rua: match[1].trim(),
      numero: match[2].trim(),
    };
  }

  // Se não encontrar número, retornar a rua completa
  return {
    rua: street.trim(),
    numero: '',
  };
}

/**
 * Migra campos de endereço de um stop
 */
function migrateStop(stop: Stop): { migrated: Stop; wasModified: boolean } {
  const updates: Partial<Stop> = {};
  let wasModified = false;

  // Migrar street → rua e numero
  if (stop.street && !stop.rua) {
    const { rua, numero } = extractStreetAndNumber(stop.street);
    updates.rua = rua;
    updates.numero = numero;
    wasModified = true;
  }

  // Migrar neighborhood → bairro
  if (stop.neighborhood && !stop.bairro) {
    updates.bairro = stop.neighborhood;
    wasModified = true;
  }

  // Migrar city → cidade
  if (stop.city && !stop.cidade) {
    updates.cidade = stop.city;
    wasModified = true;
  }

  // Migrar zipCode → cep
  if (stop.zipCode && !stop.cep) {
    updates.cep = stop.zipCode;
    wasModified = true;
  }

  return {
    migrated: { ...stop, ...updates },
    wasModified,
  };
}

async function migrateRoutes() {
  console.log('🔄 Iniciando migração de rotas...\n');

  const routesSnapshot = await db.collection('routes').get();
  let routesUpdated = 0;
  let stopsUpdated = 0;

  for (const routeDoc of routesSnapshot.docs) {
    const routeData = routeDoc.data();
    let routeHasUpdates = false;

    // Migrar stops da rota
    if (routeData.stops && Array.isArray(routeData.stops)) {
      const migratedStops: Stop[] = [];
      let stopsModifiedCount = 0;

      for (const stop of routeData.stops) {
        const { migrated, wasModified } = migrateStop(stop);
        migratedStops.push(migrated);
        if (wasModified) {
          stopsModifiedCount++;
          routeHasUpdates = true;
        }
      }

      if (routeHasUpdates) {
        await routeDoc.ref.update({ stops: migratedStops });
        stopsUpdated += stopsModifiedCount;
        const code = routeData.code || routeData.name || 'sem código';
        console.log(`✅ Rota ${routeDoc.id} (${code}): ${stopsModifiedCount} stops migrados`);
      }
    }

    // Migrar unassignedStops da rota
    if (routeData.unassignedStops && Array.isArray(routeData.unassignedStops)) {
      const migratedUnassigned: Stop[] = [];
      let unassignedModifiedCount = 0;

      for (const stop of routeData.unassignedStops) {
        const { migrated, wasModified } = migrateStop(stop);
        migratedUnassigned.push(migrated);
        if (wasModified) {
          unassignedModifiedCount++;
          routeHasUpdates = true;
        }
      }

      if (unassignedModifiedCount > 0) {
        await routeDoc.ref.update({ unassignedStops: migratedUnassigned });
        stopsUpdated += unassignedModifiedCount;
        console.log(`✅ Rota ${routeDoc.id}: ${unassignedModifiedCount} unassignedStops migrados`);
      }
    }

    if (routeHasUpdates) {
      routesUpdated++;
    }
  }

  console.log(`\n✅ Migração de rotas concluída:`);
  console.log(`   - ${routesUpdated} rotas atualizadas`);
  console.log(`   - ${stopsUpdated} stops migrados\n`);
}

async function migrateServices() {
  console.log('🔄 Iniciando migração de serviços...\n');

  const servicesSnapshot = await db.collection('services').get();
  let servicesUpdated = 0;
  let stopsUpdated = 0;

  for (const serviceDoc of servicesSnapshot.docs) {
    const serviceData = serviceDoc.data();
    let serviceHasUpdates = false;

    // Migrar allStops do serviço
    if (serviceData.allStops && Array.isArray(serviceData.allStops)) {
      const migratedStops: Stop[] = [];
      let stopsModifiedCount = 0;

      for (const stop of serviceData.allStops) {
        const { migrated, wasModified } = migrateStop(stop);
        migratedStops.push(migrated);
        if (wasModified) {
          stopsModifiedCount++;
          serviceHasUpdates = true;
        }
      }

      if (serviceHasUpdates) {
        await serviceDoc.ref.update({ allStops: migratedStops });
        stopsUpdated += stopsModifiedCount;
        servicesUpdated++;
        const code = serviceData.code || 'sem código';
        console.log(`✅ Serviço ${serviceDoc.id} (${code}): ${stopsModifiedCount} stops migrados`);
      }
    }
  }

  console.log(`\n✅ Migração de serviços concluída:`);
  console.log(`   - ${servicesUpdated} serviços atualizados`);
  console.log(`   - ${stopsUpdated} stops migrados\n`);
}

async function main() {
  try {
    console.log('🚀 Iniciando migração de campos de endereço\n');
    console.log('Migrando:');
    console.log('  - street → rua (extraindo rua e número)');
    console.log('  - neighborhood → bairro');
    console.log('  - city → cidade');
    console.log('  - zipCode → cep\n');

    await migrateRoutes();
    await migrateServices();

    console.log('✅ Migração concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  }
}

main();
