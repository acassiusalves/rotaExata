/**
 * Corrige a origem errada gravada em produção.
 *
 * 1. Reescreve settings/defaultOrigin com a origem verificada.
 * 2. Faz backfill de serviços e rotas AINDA NÃO CONCLUÍDOS.
 *
 * Documentos concluídos ficam intactos de propósito: o histórico registra a rota
 * como ela foi de fato executada, e relatórios e pagamentos passados foram
 * calculados em cima daquela origem.
 *
 * Atenção ao critério de "concluído" para SERVIÇOS: o status do serviço não é
 * confiável. Na medição de 31/08/2026, 281 serviços estavam como "dispatched" e
 * 218 deles já tinham TODAS as rotas concluídas — o status simplesmente nunca foi
 * transicionado. Por isso um serviço só conta como ativo quando alguma rota dele
 * ainda está aberta, e não pelo próprio status.
 *
 * Uso:
 *   npx tsx scripts/fix-origin-coordinates.ts            # simulação (padrão)
 *   npx tsx scripts/fix-origin-coordinates.ts --apply    # grava
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { FALLBACK_ORIGIN, isLegacyBadOrigin } from '../src/lib/default-origin';

dotenv.config({ path: '.env.local' });

const APLICAR = process.argv.includes('--apply');
const STATUS_CONCLUIDO: Record<string, string[]> = {
  services: ['completed'],
  routes: ['completed', 'completed_auto'],
};

if (getApps().length === 0) {
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = process.env;
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase não encontradas no .env.local');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }), projectId });
}
const db = getFirestore();

async function main() {
  console.log(APLICAR ? '=== MODO GRAVAÇÃO ===\n' : '=== MODO SIMULAÇÃO — nada será gravado. Use --apply para valer. ===\n');
  console.log(`Origem correta: ${FALLBACK_ORIGIN.lat}, ${FALLBACK_ORIGIN.lng}`);
  console.log(`  ${FALLBACK_ORIGIN.address}\n`);

  const settingsRef = db.collection('settings').doc('defaultOrigin');
  const atual = (await settingsRef.get()).data()?.origin;
  console.log(`settings/defaultOrigin agora: ${atual?.lat}, ${atual?.lng}`);
  if (APLICAR) {
    await settingsRef.set({ origin: FALLBACK_ORIGIN, updatedAt: new Date() });
    console.log('  -> reescrito\n');
  } else {
    console.log('  -> seria reescrito\n');
  }

  // Índice de status das rotas, para decidir se um serviço ainda está ativo.
  const statusDaRota = new Map<string, string>();
  (await db.collection('routes').get()).forEach((d) => statusDaRota.set(d.id, d.data().status ?? ''));
  const rotaAberta = (id: string) => {
    const st = statusDaRota.get(id);
    return st !== undefined && !STATUS_CONCLUIDO.routes.includes(st);
  };

  for (const colecao of ['services', 'routes'] as const) {
    const concluido = STATUS_CONCLUIDO[colecao];
    const snap = await db.collection(colecao).get();
    let alvos = 0, preservados = 0, jaOk = 0;
    const porStatus: Record<string, number> = {};
    let lote = db.batch(); let noLote = 0;

    for (const docu of snap.docs) {
      const dados = docu.data();
      if (!isLegacyBadOrigin(dados.origin)) { jaOk++; continue; }
      const st = dados.status ?? '(sem status)';
      const ehHistorico =
        colecao === 'services'
          // Serviço só é ativo se alguma rota dele ainda estiver aberta.
          ? Array.isArray(dados.routeIds) && dados.routeIds.length > 0 && !dados.routeIds.some(rotaAberta)
          : concluido.includes(st);
      if (ehHistorico) { preservados++; continue; }
      alvos++;
      porStatus[st] = (porStatus[st] ?? 0) + 1;
      if (APLICAR) {
        lote.update(docu.ref, { origin: { ...dados.origin, ...FALLBACK_ORIGIN }, originFixedAt: new Date() });
        if (++noLote >= 400) { await lote.commit(); lote = db.batch(); noLote = 0; }
      }
    }
    if (APLICAR && noLote > 0) await lote.commit();

    console.log(`${colecao}: ${snap.size} documentos no total`);
    console.log(`  ${APLICAR ? 'corrigidos' : 'a corrigir'}: ${alvos}`);
    for (const [st, n] of Object.entries(porStatus).sort((a, b) => b[1] - a[1])) {
      console.log(`      status "${st}": ${n}`);
    }
    console.log(`  preservados por serem historicos: ${preservados}`);
    console.log(`  ja com origem correta: ${jaOk}\n`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
