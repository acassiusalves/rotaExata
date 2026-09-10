/**
 * Repara o estrago do incidente de 09/09/2026: o `inviteUser` do Rota carimbou
 * `role:'driver'` por cima do cadastro de um administrador que digitou o
 * proprio e-mail no formulario de motorista.
 *
 * Como Rota e Luna compartilham a colecao `users` e UM UNICO campo `role`, isso
 * derrubou o acesso da pessoa aos dois sistemas ao mesmo tempo:
 *   - Luna  : AuthContext bloqueia login quando role === 'driver'
 *   - Rota  : caiu na area de motorista em vez da area administrativa
 *
 * O que o script faz (nesta ordem):
 *   1. USUARIO -- restaura o cadastro a partir do snapshot BASELINE gravado em
 *      `historico_configuracoes`. Nao ha chute: role, displayName e createdAt
 *      vem do snapshot, e os campos que o convite grudou (os que existem hoje
 *      mas NAO existiam no baseline) sao removidos.
 *   2. ROTA -- opcionalmente transfere a rota que rodou no cadastro errado para
 *      o motorista correto (--rota e --motorista).
 *
 * Uso:
 *   tsx scripts/reparar-cadastro-sobrescrito-por-convite.ts \
 *       --usuario=andreschaurich@gmail.com
 *
 *   tsx scripts/reparar-cadastro-sobrescrito-por-convite.ts \
 *       --usuario=andreschaurich@gmail.com \
 *       --rota=EjOEDZktomOPnGHnC3aP \
 *       --motorista=sdmsystemsdm@gmail.com \
 *       --apply
 *
 * Sem --apply nada e gravado: o script so imprime o que faria.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Credenciais do Firebase não encontradas no .env.local');
  process.exit(1);
}

const apps = getApps();
const adminApp = apps.length === 0
  ? initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
    })
  : apps[0];

const db = getFirestore(adminApp);
const auth = getAuth(adminApp);

function arg(nome: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : undefined;
}

const APPLY = process.argv.includes('--apply');
const EMAIL_USUARIO = arg('usuario');
const ROTA_ID = arg('rota');
const EMAIL_MOTORISTA = arg('motorista');

/** Campos do baseline que descrevem o snapshot, não o documento. */
const CAMPOS_META_DO_BASELINE = new Set(['id']);

/**
 * Campos que andam sozinhos com o uso normal do sistema. O baseline é uma foto
 * de um instante: o valor de hoje é o certo, e restaurá-lo apagaria informação
 * real (ex.: reverter `lastLogin` esconderia que a pessoa entrou depois). Só
 * restauramos o que descreve o cadastro — role, nome, data de criação.
 */
const CAMPOS_QUE_EVOLUEM_SOZINHOS = new Set(['lastLogin', 'updatedAt']);

function fmt(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v === undefined) return '(ausente)';
  const s = JSON.stringify(v);
  return s && s.length > 120 ? `${s.slice(0, 120)}…` : String(s);
}

async function repararUsuario(email: string) {
  console.log(`\n${'='.repeat(72)}\n1) CADASTRO — ${email}\n${'='.repeat(72)}`);

  const rec = await auth.getUserByEmail(email);
  const ref = db.collection('users').doc(rec.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`users/${rec.uid} não existe`);
  const atual = snap.data() as Record<string, unknown>;

  const hist = await db
    .collection('historico_configuracoes')
    .where('entidadeId', '==', rec.uid)
    .get();
  const baselineDoc = hist.docs
    .map((d) => d.data() as any)
    .find((d) => d?.metadata?.baseline && d?.snapshotDepois);

  if (!baselineDoc) {
    throw new Error(
      `Sem snapshot BASELINE em historico_configuracoes para ${email}. ` +
        'Sem ele não há como restaurar sem chutar — pare e investigue.'
    );
  }

  const baseline = baselineDoc.snapshotDepois as Record<string, unknown>;
  const redigidos: string[] = baselineDoc.redactedFields || [];

  // Campos a restaurar: os que o baseline conhece e hoje estão diferentes.
  const restaurar: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(baseline)) {
    if (CAMPOS_META_DO_BASELINE.has(k) || redigidos.includes(k)) continue;
    if (CAMPOS_QUE_EVOLUEM_SOZINHOS.has(k)) continue;
    const valor =
      v && typeof v === 'object' && '_seconds' in (v as any)
        ? new Timestamp((v as any)._seconds, (v as any)._nanoseconds ?? 0)
        : v;
    const igual =
      valor instanceof Timestamp && atual[k] instanceof Timestamp
        ? (atual[k] as Timestamp).isEqual(valor)
        : JSON.stringify(atual[k]) === JSON.stringify(valor);
    if (!igual) restaurar[k] = valor;
  }

  // Campos grudados pelo convite: existem hoje e não existiam no baseline.
  const remover = Object.keys(atual).filter(
    (k) => !(k in baseline) && !redigidos.includes(k)
  );

  console.log(`   uid: ${rec.uid}   (conta criada no Auth em ${rec.metadata.creationTime})`);
  console.log('\n   RESTAURAR (valor de hoje  →  valor do baseline):');
  if (!Object.keys(restaurar).length) console.log('     — nada a restaurar');
  for (const [k, v] of Object.entries(restaurar)) {
    console.log(`     ${k.padEnd(14)} ${fmt(atual[k])}  →  ${fmt(v)}`);
  }
  console.log('\n   REMOVER (grudados pelo convite, não existiam no cadastro):');
  if (!remover.length) console.log('     — nada a remover');
  for (const k of remover) console.log(`     ${k.padEnd(14)} ${fmt(atual[k])}`);

  if (!APPLY) return;

  const patch: Record<string, unknown> = { ...restaurar, updatedAt: FieldValue.serverTimestamp() };
  for (const k of remover) patch[k] = FieldValue.delete();
  await ref.update(patch);
  console.log('\n   ✅ cadastro restaurado');

  await db.collection('historico_configuracoes').add({
    area: 'Configurações',
    pagina: 'Usuários',
    entidadeTipo: 'user_account',
    entidadeId: rec.uid,
    entidadeNome: email,
    acao: 'UPDATE',
    resumo: `Cadastro restaurado após sobrescrita pelo inviteUser do Rota (incidente 09/09/2026)`,
    origem: 'script:reparar-cadastro-sobrescrito-por-convite',
    snapshotAntes: atual,
    snapshotDepois: { ...atual, ...restaurar },
    metadata: { camposRemovidos: remover },
    sucesso: true,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });
  console.log('   ✅ histórico registrado');
}

async function transferirRota(rotaId: string, emailMotorista: string) {
  console.log(`\n${'='.repeat(72)}\n2) ROTA — ${rotaId} → ${emailMotorista}\n${'='.repeat(72)}`);

  let motorista;
  try {
    motorista = await auth.getUserByEmail(emailMotorista);
  } catch {
    console.log(
      `   ⛔ ${emailMotorista} não existe no Auth.\n` +
        '      Cadastre o motorista primeiro no Rota (Motoristas → Adicionar Novo\n' +
        '      Motorista) e rode o script de novo. A rota fica como está.'
    );
    return;
  }

  const mDoc = await db.collection('users').doc(motorista.uid).get();
  const m = mDoc.data() as Record<string, any> | undefined;
  if (!m || m.role !== 'driver') {
    console.log(`   ⛔ ${emailMotorista} existe mas não tem role 'driver' (role: ${m?.role}). Abortado.`);
    return;
  }

  const ref = db.collection('routes').doc(rotaId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`routes/${rotaId} não existe`);
  const rota = snap.data() as Record<string, any>;

  const driverInfo = {
    name: m.displayName || m.name || emailMotorista,
    vehicle: m.vehicle || { type: 'N/A', plate: 'N/A' },
  };

  console.log(`   rota ${rota.code} "${rota.name}" (status: ${rota.status})`);
  console.log(`   driverId    ${rota.driverId}  →  ${motorista.uid}`);
  console.log(`   driverInfo  ${fmt(rota.driverInfo)}  →  ${fmt(driverInfo)}`);

  const notifs = await db
    .collection('routeChangeNotifications')
    .where('driverId', '==', rota.driverId)
    .get();
  const doRota = notifs.docs.filter((d) => d.data().routeId === rotaId);
  console.log(`   routeChangeNotifications desta rota a remanejar: ${doRota.length}`);

  if (!APPLY) return;

  await ref.update({ driverId: motorista.uid, driverInfo });
  for (const d of doRota) await d.ref.update({ driverId: motorista.uid });
  console.log('   ✅ rota transferida');

  await db.collection('activity_log').add({
    eventType: 'driver_changed',
    userId: 'script',
    userName: 'script:reparar-cadastro-sobrescrito-por-convite',
    entityType: 'route',
    entityId: rotaId,
    entityCode: rota.code || null,
    serviceId: rota.serviceId || null,
    serviceCode: rota.serviceCode || null,
    action: 'Motorista corrigido após incidente de convite (09/09/2026)',
    changes: {
      oldDriverId: rota.driverId,
      oldDriverName: rota.driverInfo?.name ?? null,
      newDriverId: motorista.uid,
      newDriverName: driverInfo.name,
    },
    metadata: { incidente: 'inviteUser sobrescreveu cadastro de admin' },
    timestamp: FieldValue.serverTimestamp(),
  });
  console.log('   ✅ activity_log registrado');
}

async function main() {
  if (!EMAIL_USUARIO) {
    console.error('Uso: --usuario=<email> [--rota=<id> --motorista=<email>] [--apply]');
    process.exit(1);
  }
  console.log(APPLY ? '\n⚠️  MODO --apply: as alterações SERÃO gravadas' : '\n🔍 DRY-RUN: nada será gravado (use --apply para gravar)');

  await repararUsuario(EMAIL_USUARIO);

  if (ROTA_ID && EMAIL_MOTORISTA) {
    await transferirRota(ROTA_ID, EMAIL_MOTORISTA);
  } else if (ROTA_ID || EMAIL_MOTORISTA) {
    console.log('\n⚠️  --rota e --motorista precisam vir juntos. Etapa 2 pulada.');
  }

  console.log('\nFim.\n');
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
