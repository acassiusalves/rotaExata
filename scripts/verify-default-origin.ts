/**
 * Verificação da origem padrão do sistema.
 *
 * Confere que FALLBACK_ORIGIN é internamente consistente: o endereço textual,
 * quando geocodificado pelo Google, cai no mesmo lugar que as coordenadas
 * declaradas ao lado dele. Foi exatamente essa consistência que faltou no valor
 * antigo — endereço certo, coordenadas 3,78 km fora.
 *
 * Uso: npx tsx scripts/verify-default-origin.ts
 */
import * as dotenv from 'dotenv';
import { FALLBACK_ORIGIN, isValidOrigin } from '../src/lib/default-origin';

dotenv.config({ path: '.env.local' });

const KEY = process.env.GMAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GMAPS_KEY;
const TOLERANCIA_METROS = 100;

function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function main() {
  let falhas = 0;
  const falhar = (msg: string) => { console.error(`FALHA: ${msg}`); falhas++; };

  if (!isValidOrigin(FALLBACK_ORIGIN)) falhar('FALLBACK_ORIGIN não passa em isValidOrigin');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${FALLBACK_ORIGIN.placeId}&language=pt-BR&key=${KEY}`;
  const res = await fetch(url).then((r) => r.json());

  if (res.status !== 'OK') {
    falhar(`place ID recusado pelo Google: ${res.status} ${res.error_message ?? ''}`);
  } else {
    const loc = res.results[0].geometry.location;
    const d = distanciaMetros(FALLBACK_ORIGIN, loc);
    console.log(`place ID resolve para ${loc.lat}, ${loc.lng} — ${d.toFixed(0)} m da constante`);
    if (d > TOLERANCIA_METROS) falhar(`place ID está a ${d.toFixed(0)} m das coordenadas declaradas`);
  }

  const geo = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(FALLBACK_ORIGIN.address)}&region=br&language=pt-BR&key=${KEY}`,
  ).then((r) => r.json());

  if (geo.status !== 'OK') {
    falhar(`endereço textual não geocodifica: ${geo.status}`);
  } else {
    const loc = geo.results[0].geometry.location;
    const d = distanciaMetros(FALLBACK_ORIGIN, loc);
    console.log(`endereço textual resolve para ${loc.lat}, ${loc.lng} — ${d.toFixed(0)} m da constante`);
    if (d > TOLERANCIA_METROS) falhar(`endereço textual está a ${d.toFixed(0)} m das coordenadas declaradas`);
  }

  if (falhas > 0) { console.error(`\n${falhas} falha(s).`); process.exit(1); }
  console.log('\nOrigem padrão consistente.');
}

main().catch((e) => { console.error(e); process.exit(1); });
