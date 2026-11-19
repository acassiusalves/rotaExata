import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const storageBaselineHash = 'a2df67ee0bca229e57475db6896efbea0d0d36618cfc79436d703d9fd805986c';

class StorageCutoverError extends Error {}

export function renderStorageCutover(baseline: string, manifest: unknown) {
  if (createHash('sha256').update(baseline).digest('hex') !== storageBaselineHash) {
    throw new StorageCutoverError('O hash da baseline Storage diverge da release revisada.');
  }
  if (!manifest || typeof manifest !== 'object' || Object.keys(manifest).length !== 1 || !('driverUids' in manifest)) {
    throw new StorageCutoverError('O manifesto deve conter apenas driverUids.');
  }
  const uids = manifest.driverUids;
  if (!Array.isArray(uids) || !uids.length ||
      !uids.every(uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid)) ||
      new Set(uids).size !== uids.length) {
    throw new StorageCutoverError('O manifesto deve conter UIDs válidos, distintos e não vazios.');
  }

  const list = JSON.stringify([...uids].sort());
  const marker = '  match /b/{bucket}/o {\n';
  const helper = `
    function isDeliveryPhotoClient() {
      return request.auth != null && !(request.auth.uid in ${list});
    }
`;
  return baseline.replace(marker,marker+helper)
    .replace('allow read: if request.auth != null;', 'allow read: if isDeliveryPhotoClient();')
    .replace('allow write: if request.auth != null', 'allow write: if isDeliveryPhotoClient()');
}

function main(args: string[]) {
  if (args.length !== 2) throw new StorageCutoverError('Uso: render-storage-cutover.ts <baseline.rules> <manifesto-privado.json>');
  const [baselinePath,manifestPath] = args;
  const manifestStat = statSync(manifestPath);
  if (!manifestStat.isFile() || (manifestStat.mode & 0o077) !== 0) {
    throw new StorageCutoverError('O manifesto deve ser um arquivo privado com permissões 600.');
  }
  const rules = renderStorageCutover(readFileSync(baselinePath,'utf8'),JSON.parse(readFileSync(manifestPath,'utf8')));
  const temporary = realpathSync(tmpdir());
  for (let path=temporary;;path=dirname(path)) {
    if (existsSync(join(path,'.git'))) throw new StorageCutoverError('O diretório temporário deve ficar fora da worktree.');
    if (path===dirname(path)) break;
  }
  const directory = mkdtempSync(join(temporary,'rota-storage-cutover-'));
  const output = join(directory,'storage.rules');
  writeFileSync(output,rules,{encoding:'utf8',flag:'wx',mode:0o600});
  console.log(output);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof StorageCutoverError ? error.message : 'Falha ao ler as entradas ou gerar as Rules privadas.');
    process.exitCode = 1;
  }
}
