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
  // Formatos possíveis:
  // 1. "Av. Iguatemi - Parque Itália, Aparecida de Goiânia - GO, 74968-740, Brasil"
  // 2. "Av. Dr. Jose Hermano, 8 - Vila Jardim Vitoria, Goiânia - GO, 74470-515, Brasil"
  // 3. "Rua X, Bairro Y, Cidade - Estado, CEP, Brasil"

  // Remover ", Brasil" do final
  let cleanAddress = address.replace(/, Brasil$/, '');

  // Dividir por vírgulas
  const parts = cleanAddress.split(',').map(p => p.trim());

  const result: any = {};

  // Identificar CEP (formato: XXXXX-XXX ou apenas dígitos)
  const cepRegex = /\b\d{5}-?\d{3}\b/;
  let cepIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (cepRegex.test(parts[i])) {
      result.zipCode = parts[i].match(cepRegex)?.[0];
      cepIndex = i;
      break;
    }
  }

  // Identificar Cidade - Estado (formato: "Cidade - UF")
  let cityStateIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (i === cepIndex) continue; // Pular CEP

    // Verificar se tem formato "Cidade - UF" (2 letras maiúsculas)
    if (parts[i].includes(' - ') && /\b[A-Z]{2}\b/.test(parts[i])) {
      const [cityPart, statePart] = parts[i].split(' - ').map(s => s.trim());
      result.city = cityPart;
      result.state = statePart;
      cityStateIndex = i;
      break;
    }
  }

  // Se não encontrou cidade-estado no formato padrão, última parte antes do CEP pode ser a cidade
  if (!result.city && cepIndex > 0) {
    const potentialCity = parts[cepIndex - 1];
    if (potentialCity && !potentialCity.includes(' - ')) {
      result.city = potentialCity;
      cityStateIndex = cepIndex - 1;
    }
  }

  // Primeira parte: Rua (e possivelmente bairro se tiver " - ")
  if (parts.length >= 1) {
    const firstPart = parts[0];

    // Se tem " - ", pode ser "Rua - Bairro" ou "Rua, Número - Bairro"
    if (firstPart.includes(' - ')) {
      const splitDash = firstPart.split(' - ');
      result.street = splitDash[0].trim();

      // Se há mais de uma parte após o " - ", a última é o bairro
      if (splitDash.length > 1) {
        result.neighborhood = splitDash.slice(1).join(' - ').trim();
      }
    } else {
      result.street = firstPart;
    }
  }

  // Segunda parte (se não for cidade-estado e não for CEP): provavelmente é bairro
  if (parts.length >= 2 && cityStateIndex !== 1 && cepIndex !== 1) {
    if (!result.neighborhood) {
      const secondPart = parts[1];

      // Se já tem cidade-estado identificada em outra parte, esta é o bairro
      if (result.city || secondPart.includes(' - ')) {
        // Se tem " - " pode ser "Número - Bairro"
        if (secondPart.includes(' - ')) {
          const splitDash = secondPart.split(' - ');
          // Se a primeira parte é só número, adicionar à rua
          if (/^\d+$/.test(splitDash[0].trim())) {
            result.street = result.street + ', ' + splitDash[0].trim();
          }
          result.neighborhood = splitDash.slice(/^\d+$/.test(splitDash[0].trim()) ? 1 : 0).join(' - ').trim();
        } else {
          result.neighborhood = secondPart;
        }
      }
    }
  }

  // Limpar campos undefined ou vazios
  Object.keys(result).forEach(key => {
    if (!result[key] || result[key] === '') {
      delete result[key];
    }
  });

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
