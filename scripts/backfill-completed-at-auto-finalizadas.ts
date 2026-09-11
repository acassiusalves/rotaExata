/**
 * Backfill de `completedAt` nas rotas que o robo auto-finalizou ANTES da
 * correcao de 11/09/2026 (commit 460dd9c).
 *
 * `autoCompleteRoutes` fechava rotas paradas ha 48h sem gravar `completedAt`.
 * Como `payment-generator` exige esse campo, nenhuma rota auto-finalizada
 * gerava pagamento -- inclusive as que foram percorridas por inteiro e so nao
 * foram encerradas no app pelo motorista.
 *
 * A correcao ja esta em producao e vale daqui pra frente. Este script trata o
 * passivo: preenche `completedAt` nas rotas antigas que se qualificam.
 *
 * A decisao NAO e reimplementada aqui -- o script importa `resolveAutoCompletion`,
 * a MESMA funcao que o robo usa. Se a regra mudar, este script muda junto.
 *
 * Uso:  tsx scripts/backfill-completed-at-auto-finalizadas.ts          (dry-run)
 *       tsx scripts/backfill-completed-at-auto-finalizadas.ts --apply  (grava)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { resolveAutoCompletion } from '../functions/src/auto-completion';

dotenv.config({ path: '.env.local' });

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = process.env;
if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Credenciais do Firebase não encontradas no .env.local');
  process.exit(1);
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }) });

const db = getFirestore(app);
const APPLY = process.argv.includes('--apply');

const dia = (t: Timestamp) => t.toDate().toISOString().slice(0, 16).replace('T', ' ');

async function main() {
  console.log(APPLY
    ? '\n⚠️  MODO --apply: as alterações SERÃO gravadas'
    : '\n🔍 DRY-RUN: nada será gravado (use --apply para gravar)');

  const rotas = await db.collection('routes').where('status', '==', 'completed_auto').get();

  const alvo: { id: string; code: string; driver: string; fim: Timestamp; entregas: string }[] = [];
  let jaTinham = 0;
  const recusadas: Record<string, number> = {};

  for (const doc of rotas.docs) {
    const r = doc.data() as any;

    // Nunca sobrescrever uma data que ja existe.
    if (r.completedAt) { jaTinham++; continue; }

    const desfecho = resolveAutoCompletion(r.stops ?? []);
    if (!desfecho.worked) {
      recusadas[desfecho.reason] = (recusadas[desfecho.reason] ?? 0) + 1;
      continue;
    }

    const stops: any[] = r.stops ?? [];
    const entregues = stops.filter((s) => s.deliveryStatus === 'completed').length;
    const falhas = stops.filter((s) => s.deliveryStatus === 'failed').length;

    alvo.push({
      id: doc.id,
      code: r.code ?? doc.id,
      driver: r.driverInfo?.name ?? '(sem nome)',
      fim: desfecho.finishedAt as Timestamp,
      entregas: `${entregues} entregues${falhas ? ` + ${falhas} falhas` : ''}`,
    });
  }

  console.log(`\n${rotas.size} rotas 'completed_auto' no total`);
  console.log(`  já tinham completedAt      : ${jaTinham}`);
  console.log(`  não se qualificam          : ${Object.entries(recusadas).map(([k, v]) => `${v} ${k}`).join(', ') || '—'}`);
  console.log(`  RECEBEM completedAt        : ${alvo.length}`);

  console.log('\nrota'.padEnd(14) + 'completedAt a gravar'.padEnd(20) + 'paradas'.padEnd(24) + 'motorista');
  console.log('-'.repeat(92));
  for (const a of alvo.sort((x, y) => y.fim.toMillis() - x.fim.toMillis())) {
    console.log(a.code.padEnd(14) + dia(a.fim).padEnd(20) + a.entregas.padEnd(24) + a.driver);
  }
  console.log('-'.repeat(92));

  if (!APPLY) {
    console.log('\nNada gravado. Rode com --apply para aplicar.\n');
    return;
  }

  let n = 0;
  for (const a of alvo) {
    await db.collection('routes').doc(a.id).update({
      completedAt: a.fim,
      completedAtBackfill: {
        origem: 'script:backfill-completed-at-auto-finalizadas',
        motivo: 'rota percorrida por inteiro; robô auto-finalizava sem gravar completedAt',
        em: FieldValue.serverTimestamp(),
      },
    });

    await db.collection('activity_log').add({
      timestamp: FieldValue.serverTimestamp(),
      eventType: 'route_completed_at_backfilled',
      userId: 'script',
      userName: 'script:backfill-completed-at-auto-finalizadas',
      entityType: 'route',
      entityId: a.id,
      entityCode: a.code,
      routeId: a.id,
      routeCode: a.code,
      action: `completedAt preenchido retroativamente (${dia(a.fim)}) — rota percorrida por inteiro e auto-finalizada sem a data`,
      changes: [{ field: 'completedAt', oldValue: null, newValue: a.fim, fieldLabel: 'Concluída em' }],
      metadata: { driverName: a.driver, paradas: a.entregas },
    });

    n++;
    console.log(`  ✅ ${a.code}`);
  }
  console.log(`\n${n} rota(s) atualizada(s). Elas passam a ser elegíveis à geração de pagamento.\n`);
}

main().catch((e) => { console.error('\n❌', e); process.exit(1); });
