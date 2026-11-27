import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { prepareLegacyBatch } from '../src/lib/server/earnings/legacy.ts';
import { earningsRpc, earningsSupabaseUrl } from '../src/lib/server/earnings/transport.ts';

function chunkId(batchId: string, index: number) {
  if (index === 0) return batchId;
  const digest = createHash('sha256').update(batchId + ':' + index).digest('hex');
  return digest.slice(0,8) + '-' + digest.slice(8,12) + '-4' + digest.slice(13,16) + '-8' + digest.slice(17,20) + '-' + digest.slice(20,32);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { apply: { type: 'boolean' }, promote: { type:'boolean' }, target: { type: 'string' }, scope: { type: 'string' }, batch: { type: 'string' } },
  });
  if (positionals.length !== 1 || (values.apply && values.promote)) throw new Error('invalid_arguments');
  const batch = prepareLegacyBatch(JSON.parse(await readFile(positionals[0],'utf8')));
  console.log(JSON.stringify({ mode: values.apply ? 'stage' : values.promote ? 'promote' : 'dry-run', fingerprint: batch.fingerprint, sourceCutoff: batch.sourceCutoff, ...batch.summary },null,2));
  if (!values.apply && !values.promote) return;

  const target = earningsSupabaseUrl();
  if (!values.target || new URL(values.target).origin !== target) throw new Error('target_mismatch');
  const scopeId = z.string().uuid().parse(values.scope);
  const batchId = z.string().uuid().parse(values.batch);
  let promoted = 0;
  let remaining = 0;
  let staged = 0;
  let replayed = 0;
  const chunks = Math.max(1,Math.ceil(batch.rows.length/50));
  for (let index=0; index<chunks; index++) {
    const identity = {
      p_scope_id:scopeId,p_batch_id:chunkId(batchId,index),
      p_fingerprint:createHash('sha256').update(batch.fingerprint + ':' + index).digest('hex'),
    };
    const result = values.promote
      ? await earningsRpc<{ errorCode?: string; promoted?: number; remaining?: number }>('rota_earnings_promote_legacy',identity)
      : await earningsRpc<{ errorCode?: string; staged?: number; replayed?: number }>('rota_earnings_import_legacy', {
      ...identity,p_source_project:batch.sourceProject,
      p_source_cutoff: batch.sourceCutoff, p_legacy_rule: index === 0 ? batch.legacyRule : null,
      p_rows: batch.rows.slice(index*50,index*50+50),
    });
    if (result.errorCode) throw new Error('import_conflict');
    if ('promoted' in result) promoted += result.promoted ?? 0;
    if ('remaining' in result) remaining += result.remaining ?? 0;
    if ('staged' in result) staged += result.staged ?? 0;
    if ('replayed' in result) replayed += result.replayed ?? 0;
  }
  console.log(JSON.stringify(values.promote ? { promoted,remaining } : { staged,replayed }));
}
main().catch(() => {
  console.error('Importação interrompida. Verifique o destino e o manifesto. Lotes já confirmados podem ser reexecutados com o mesmo ID.');
  process.exitCode = 1;
});
