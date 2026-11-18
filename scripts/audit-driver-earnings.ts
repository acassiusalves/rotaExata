import { readFile } from 'node:fs/promises';
import { prepareLegacyBatch } from '../src/lib/server/earnings/legacy.ts';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Informe o arquivo privado de origem.');
  const audit = prepareLegacyBatch(JSON.parse(await readFile(file, 'utf8')));
  console.log(JSON.stringify({ fingerprint: audit.fingerprint, sourceCutoff: audit.sourceCutoff, ...audit.summary }, null, 2));
}
main().catch(() => {
  console.error('Inventário inválido ou indisponível.');
  process.exitCode = 1;
});
