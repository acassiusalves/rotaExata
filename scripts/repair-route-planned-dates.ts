/**
 * Repara plannedDate/period de rotas vinculadas a servicos Lunna.
 *
 * Regra: a rota deve herdar exatamente o plannedDate do servico pai.
 *
 * Uso:
 *   npx tsx scripts/repair-route-planned-dates.ts
 *   npx tsx scripts/repair-route-planned-dates.ts --service LNS-0032
 *   npx tsx scripts/repair-route-planned-dates.ts --route <routeId|routeCode>
 *   npx tsx scripts/repair-route-planned-dates.ts --apply
 *   npx tsx scripts/repair-route-planned-dates.ts --sync-period
 *   npx tsx scripts/repair-route-planned-dates.ts --include-drafts
 *   npx tsx scripts/repair-route-planned-dates.ts --copy-service-datetime
 *   npx tsx scripts/repair-route-planned-dates.ts --apply --limit 20
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase nao encontradas no .env.local');
    console.error('Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.');
    process.exit(1);
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
    projectId,
  });
}

const db = getFirestore();
const REPORT_RELEVANT_STATUSES = new Set(['dispatched', 'in_progress', 'completed', 'completed_auto']);

type Period = 'Matutino' | 'Vespertino' | 'Noturno';

type ServiceLike = {
  id: string;
  code?: string;
  plannedDate?: Timestamp | Date | string | null;
};

type RouteLike = {
  id: string;
  code?: string;
  name?: string;
  source?: string;
  serviceId?: string;
  serviceCode?: string;
  status?: string;
  period?: string;
  plannedDate?: Timestamp | Date | string | null;
};

type Candidate = {
  routeId: string;
  routeCode: string;
  routeStatus: string;
  serviceId: string;
  serviceCode: string;
  currentPlannedDate: Date | null;
  targetPlannedDate: Date;
  currentPeriod: string | null;
  targetPeriod: Period;
  reasons: string[];
};

function getArgValue(flag: string): string | null {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriod(date: Date): Period {
  const hour = date.getHours();
  if (hour >= 8 && hour < 12) return 'Matutino';
  if (hour >= 12 && hour < 19) return 'Vespertino';
  return 'Noturno';
}

function formatDateTime(date: Date | null): string {
  if (!date) return 'N/A';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function combineDateAndTime(baseDate: Date, timeSource: Date): Date {
  const combined = new Date(baseDate);
  combined.setHours(
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  );
  return combined;
}

async function loadServices(serviceFilter: string | null): Promise<Map<string, ServiceLike>> {
  const services = new Map<string, ServiceLike>();

  if (serviceFilter) {
    const byIdSnap = await db.collection('services').doc(serviceFilter).get();
    if (byIdSnap.exists) {
      const service = { id: byIdSnap.id, ...(byIdSnap.data() as ServiceLike) };
      services.set(service.id, service);
      if (service.code) services.set(`code:${service.code}`, service);
      return services;
    }

    const byCodeSnap = await db.collection('services').where('code', '==', serviceFilter).limit(1).get();
    if (!byCodeSnap.empty) {
      const doc = byCodeSnap.docs[0];
      const service = { id: doc.id, ...(doc.data() as ServiceLike) };
      services.set(service.id, service);
      if (service.code) services.set(`code:${service.code}`, service);
      return services;
    }

    return services;
  }

  const servicesSnap = await db.collection('services').where('source', '==', 'lunna').get();
  for (const doc of servicesSnap.docs) {
    const service = { id: doc.id, ...(doc.data() as ServiceLike) };
    services.set(service.id, service);
    if (service.code) services.set(`code:${service.code}`, service);
  }

  return services;
}

async function loadRoutes(serviceFilter: string | null, routeFilter: string | null): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (routeFilter) {
    const byIdSnap = await db.collection('routes').doc(routeFilter).get();
    if (byIdSnap.exists) {
      return [byIdSnap as FirebaseFirestore.QueryDocumentSnapshot];
    }

    const byCodeSnap = await db.collection('routes').where('code', '==', routeFilter).limit(1).get();
    return byCodeSnap.docs;
  }

  if (serviceFilter) {
    const byServiceId = await db.collection('routes').where('serviceId', '==', serviceFilter).get();
    if (!byServiceId.empty) {
      return byServiceId.docs;
    }

    const byServiceCode = await db.collection('routes').where('serviceCode', '==', serviceFilter).get();
    return byServiceCode.docs;
  }

  const routesSnap = await db.collection('routes').where('source', '==', 'lunna').get();
  return routesSnap.docs;
}

async function main() {
  const apply = hasFlag('--apply');
  const syncPeriod = hasFlag('--sync-period');
  const includeDrafts = hasFlag('--include-drafts');
  const copyServiceDatetime = hasFlag('--copy-service-datetime');
  const serviceFilter = getArgValue('--service');
  const routeFilter = getArgValue('--route');
  const limitValue = getArgValue('--limit');
  const limit = limitValue ? Number(limitValue) : null;

  if (limitValue && (!limit || limit < 1)) {
    console.error('Valor invalido para --limit.');
    process.exit(1);
  }

  console.log(apply ? 'Modo APPLY: alteracoes serao gravadas.\n' : 'Modo DRY-RUN: nenhuma alteracao sera gravada.\n');
  console.log(syncPeriod ? 'Sincronizacao de period habilitada.\n' : 'Sincronizacao de period desabilitada.\n');
  console.log(includeDrafts ? 'Incluindo rotas draft.\n' : 'Ignorando rotas draft.\n');
  console.log(copyServiceDatetime ? 'Modo agressivo: copiando data/hora completa do servico.\n' : 'Modo seguro: preservando a data da rota e ajustando apenas o horario.\n');

  const services = await loadServices(serviceFilter);
  if (serviceFilter && services.size === 0) {
    console.error(`Servico "${serviceFilter}" nao encontrado.`);
    process.exit(1);
  }

  const routeDocs = await loadRoutes(serviceFilter, routeFilter);
  if (routeFilter && routeDocs.length === 0) {
    console.error(`Rota "${routeFilter}" nao encontrada.`);
    process.exit(1);
  }

  console.log(`Servicos carregados: ${Math.floor(services.size / 2) || services.size}`);
  console.log(`Rotas inspecionadas: ${routeDocs.length}\n`);

  const candidates: Candidate[] = [];
  let missingService = 0;
  let missingServicePlannedDate = 0;
  let alreadyAligned = 0;
  let skippedByStatus = 0;
  let exactTimeOnlyMismatch = 0;

  for (const routeDoc of routeDocs) {
    const route = { id: routeDoc.id, ...(routeDoc.data() as RouteLike) };

    if (!includeDrafts && route.status && !REPORT_RELEVANT_STATUSES.has(route.status)) {
      skippedByStatus++;
      continue;
    }

    const service = (route.serviceId && services.get(route.serviceId)) ||
      (route.serviceCode && services.get(`code:${route.serviceCode}`));

    if (!service) {
      missingService++;
      continue;
    }

    const servicePlannedDate = toDate(service.plannedDate);
    if (!servicePlannedDate) {
      missingServicePlannedDate++;
      continue;
    }

    const routePlannedDate = toDate(route.plannedDate);
    const currentPeriod = routePlannedDate ? getPeriod(routePlannedDate) : null;
    const targetPlannedDate = routePlannedDate && !copyServiceDatetime
      ? combineDateAndTime(routePlannedDate, servicePlannedDate)
      : servicePlannedDate;
    const targetPeriod = getPeriod(targetPlannedDate);
    const reasons: string[] = [];
    const currentTargetTimeDiffers = !routePlannedDate || routePlannedDate.getTime() !== targetPlannedDate.getTime();
    const periodDiffers = currentPeriod !== targetPeriod;

    if (!routePlannedDate) {
      reasons.push('plannedDate ausente na rota');
    } else if (copyServiceDatetime && currentTargetTimeDiffers) {
      reasons.push('plannedDate difere do servico');
    } else if (!copyServiceDatetime && periodDiffers) {
      reasons.push('periodo da rota difere do servico');
    }

    if (syncPeriod && periodDiffers) {
      reasons.push('period divergente');
    }

    if (!periodDiffers && currentTargetTimeDiffers && !copyServiceDatetime) {
      exactTimeOnlyMismatch++;
    }

    if (reasons.length === 0) {
      alreadyAligned++;
      continue;
    }

    candidates.push({
      routeId: routeDoc.id,
      routeCode: route.code || route.name || routeDoc.id,
      routeStatus: route.status || 'sem_status',
      serviceId: service.id,
      serviceCode: service.code || route.serviceCode || 'sem_codigo',
      currentPlannedDate: routePlannedDate,
      targetPlannedDate,
      currentPeriod,
      targetPeriod,
      reasons,
    });
  }

  const limitedCandidates = limit ? candidates.slice(0, limit) : candidates;

  console.log(`Rotas ja alinhadas: ${alreadyAligned}`);
  console.log(`Rotas sem servico resolvido: ${missingService}`);
  console.log(`Servicos sem plannedDate: ${missingServicePlannedDate}`);
  console.log(`Rotas ignoradas por status: ${skippedByStatus}`);
  console.log(`Candidatas ao reparo: ${candidates.length}`);
  console.log(`Rotas com apenas diferenca fina de horario: ${exactTimeOnlyMismatch}`);
  if (limit && candidates.length > limitedCandidates.length) {
    console.log(`Aplicando limite: ${limitedCandidates.length} de ${candidates.length}`);
  }

  if (limitedCandidates.length === 0) {
    console.log('\nNenhuma rota precisa de reparo.');
    return;
  }

  console.log('\nAmostra das rotas candidatas:');
  for (const candidate of limitedCandidates.slice(0, 20)) {
    console.log(`- ${candidate.routeCode} [${candidate.routeStatus}] <- ${candidate.serviceCode}`);
    console.log(`  atual:  ${formatDateTime(candidate.currentPlannedDate)} | periodo: ${candidate.currentPeriod || 'N/A'}`);
    console.log(`  alvo:   ${formatDateTime(candidate.targetPlannedDate)} | periodo: ${candidate.targetPeriod}`);
    console.log(`  motivo: ${candidate.reasons.join(', ')}`);
  }

  if (!apply) {
    console.log('\nDry-run concluido. Use --apply para gravar as alteracoes.');
    return;
  }

  let updated = 0;
  while (limitedCandidates.length > 0) {
    const batch = db.batch();
    const chunk = limitedCandidates.splice(0, 400);

    for (const candidate of chunk) {
      const routeRef = db.collection('routes').doc(candidate.routeId);
      const updateData: Record<string, unknown> = {
        plannedDate: Timestamp.fromDate(candidate.targetPlannedDate),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (syncPeriod) {
        updateData.period = candidate.targetPeriod;
      }

      batch.update(routeRef, updateData);
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`Batch aplicado: ${updated} rota(s) atualizada(s).`);
  }

  console.log(`\nReparo concluido. Total atualizado: ${updated}`);
}

main().catch((error) => {
  console.error('\nErro durante o reparo:', error);
  process.exit(1);
});
