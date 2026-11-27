import { readFile } from 'node:fs/promises';

const [, , sha, origin] = process.argv;
if (!/^[0-9a-f]{40}$/i.test(sha ?? '')) {
  throw new Error('Informe o SHA completo do commit aprovado e, para conferir uma publicação, a origem HTTPS.');
}
const expected = sha.toLowerCase().slice(0, 12);
let actual;
if (origin) {
  const address = new URL(origin);
  if (address.protocol !== 'https:' || address.origin !== address.href.replace(/\/$/, '')) {
    throw new Error('Informe a origem HTTPS da publicação.');
  }
  const response = await fetch(new URL('/api/version', address), {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('A consulta da versão retornou HTTP ' + response.status + '.');
  actual = (await response.json()).buildId;
} else {
  actual = (await readFile('.next/BUILD_ID', 'utf8')).trim();
}

if (actual !== expected) {
  throw new Error('O build retornou ' + JSON.stringify(actual) + '. Commit aprovado ' + expected + '.');
}
console.log('Commit do build confirmado ' + expected);
