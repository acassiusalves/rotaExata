/**
 * Verificação do parser de links do Google Maps.
 * Uso: npx tsx scripts/verify-maps-link.ts
 */
import { extractCoordsFromMapsUrl, isShortMapsLink } from '../src/lib/maps-link';

const ALVO = { lat: -16.7123299, lng: -49.2511399 };

const casos: Array<{ nome: string; url: string; esperado: { lat: number; lng: number } | null }> = [
  {
    nome: 'link longo de place — prioriza !3d/!4d (local) sobre @ (centro do mapa)',
    url: 'https://www.google.com/maps/place/Sol+de+Maria+Brasil/@-16.6,-49.1,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-16.7123299!4d-49.2511399!16s%2Fg%2F11f272jyj8',
    esperado: ALVO,
  },
  { nome: 'link longo só com @lat,lng', url: 'https://www.google.com/maps/@-16.7123299,-49.2511399,17z', esperado: ALVO },
  { nome: 'formato ?q=lat,lng', url: 'https://www.google.com/maps?q=-16.7123299,-49.2511399', esperado: ALVO },
  { nome: 'formato ?ll=lat,lng', url: 'https://maps.google.com/?ll=-16.7123299,-49.2511399&z=17', esperado: ALVO },
  { nome: 'link curto não tem coordenada', url: 'https://maps.app.goo.gl/GJJVfxQyjJYt3jk47', esperado: null },
  { nome: 'texto que não é URL', url: 'Avenida Circular, 1028', esperado: null },
  { nome: 'string vazia', url: '', esperado: null },
  { nome: 'coordenada fora de faixa é rejeitada', url: 'https://www.google.com/maps/@-916.7,-49.25,17z', esperado: null },
];

let falhas = 0;
for (const c of casos) {
  const obtido = extractCoordsFromMapsUrl(c.url);
  const ok = c.esperado === null
      ? obtido === null
      : obtido !== null && Math.abs(obtido.lat - c.esperado.lat) < 1e-6 && Math.abs(obtido.lng - c.esperado.lng) < 1e-6;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${c.nome} -> ${JSON.stringify(obtido)}`);
  if (!ok) falhas++;
}

for (const c of [
  { url: 'https://maps.app.goo.gl/GJJVfxQyjJYt3jk47', esperado: true },
  { url: 'https://goo.gl/maps/abc123', esperado: true },
  { url: 'https://www.google.com/maps/place/x/@-16.7,-49.2,17z', esperado: false },
]) {
  const obtido = isShortMapsLink(c.url);
  const ok = obtido === c.esperado;
  console.log(`${ok ? 'ok  ' : 'FALHA'} isShortMapsLink(${c.url}) -> ${obtido}`);
  if (!ok) falhas++;
}

if (falhas > 0) { console.error(`\n${falhas} falha(s).`); process.exit(1); }
console.log('\nParser de link ok.');
