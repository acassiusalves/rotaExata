import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRule, normalizeRouteFacts, calculateEarnings } from '../src/lib/earnings/domain.ts';

const base = {
  workedAt: '2026-11-21T10:00:00.000Z',
  plannedAt: '2026-11-20',
  distanceMeters: 12500,
  origin: { lat: 0, lng: 0 },
  stops: [
    { id: '1', status: 'completed', city: 'Goiânia', state: 'GO', lat: 0, lng: 0, lunna: true },
    { id: '2', status: 'completed', city: 'Goiania', state: 'GO', lat: 0, lng: 1, lunna: true },
    { id: '3', status: 'failed', visited: true, city: 'Goiânia', state: 'GO', lat: 0, lng: 0 },
    { id: '4', status: 'failed', visited: false },
  ],
};
const distance = { mode: 'distance', baseCents: 2000, kilometerCents: 120, deliveryCents: 200, attemptCents: 100 };
const zone = { mode: 'zone', attemptBasisPoints: 2000, zones: [
  { cities: 'Goiânia/GO', priceCents: 500, radiusMeters: 7000 },
  { cities: [{ name: 'Goiania', uf: 'GO' }], priceCents: 1000 },
] };

function quote(facts: unknown, rule: unknown) {
  const normalizedFacts = normalizeRouteFacts(facts);
  const normalizedRule = normalizeRule(rule);
  assert.ok(!Array.isArray(normalizedFacts), JSON.stringify(normalizedFacts));
  assert.ok(!Array.isArray(normalizedRule), JSON.stringify(normalizedRule));
  return calculateEarnings(normalizedFacts, normalizedRule);
}

test('uses city and UF, priority, radius inclusive and valid coordinate zero', () => {
  const value = quote(base, zone);
  assert.ok(!Array.isArray(value));
  assert.equal(value.totalCents, 1600);
  const meters = (distanceMeters: number) => distanceMeters * 180 / (Math.PI * 6371000);
  const edge = (distanceMeters: number) => quote({ ...base, stops: [{ ...base.stops[0], lng: meters(distanceMeters) }] }, zone);
  assert.match(JSON.stringify(edge(7000)), /"totalCents":500/);
  assert.match(JSON.stringify(edge(7001)), /"totalCents":1000/);
});

test('distance and delivery values use integer cents and per-line rounding', () => {
  const first = quote(base, distance);
  assert.ok(!Array.isArray(first));
  assert.equal(first.totalCents, 4000);
  const second = quote({ ...base, distanceMeters: 1234 }, distance);
  assert.ok(!Array.isArray(second));
  assert.equal(second.items.find(item => item.component === 'distance')?.cents, 148);
});

test('chooses highest applicable multiplier and leaves Lunna and volume extras outside its base', () => {
  const rule = {
    ...distance, baseCents: 2100, attemptCents: 0, lunnaCents: 100, volume: [{ minimum: 2, cents: 500 }],
    multipliers: [
      { period: 'morning', startHour: 6, endHour: 8, basisPoints: 12000 },
      { period: 'weekend', basisPoints: 11500 },
    ],
  };
  const value = quote(base, rule);
  assert.ok(!Array.isArray(value));
  assert.equal(value.totalCents, 5500);
  const after = quote({ ...base, workedAt: '2026-11-21T11:00:00Z' }, rule);
  assert.ok(!Array.isArray(after));
  assert.equal(after.totalCents, 5300);
});

test('review is explicit when facts or a commercial rule do not support issuance', () => {
  assert.deepEqual(quote({ ...base, origin: null }, zone), [{ code: 'missing_origin', stopId: '1' }, { code: 'missing_origin', stopId: '2' }, { code: 'missing_origin', stopId: '3' }]);
  assert.deepEqual(normalizeRule({ mode: 'hybrid' }), [{ code: 'unsupported_hybrid' }]);
  assert.ok(Array.isArray(normalizeRouteFacts({ ...base, distanceMeters: NaN })));
  assert.ok(Array.isArray(normalizeRouteFacts({ ...base, workedAt: '2026-02-31T00:00:00Z' })));
  assert.ok(Array.isArray(quote({ ...base, stops: [{ ...base.stops[0], city: 'Recife' }] }, zone)));
});

test('normalizes only explicit Goiás suffixes on source municipalities',()=>{
  const cases=['Goiânia - GO','Goiania - Goiás','GOIÂNIA - GO - GOIÁS'];
  for (const city of cases) {
    const quoted=quote({...base,stops:[{...base.stops[0],city,state:null}]},zone);
    assert.ok(!Array.isArray(quoted),city);
    assert.equal(quoted.totalCents,500,city);
  }
  assert.deepEqual(quote({...base,stops:[{...base.stops[0],city:'Goiânia - GO - Goiás',state:'MG'}]},zone),
    [{code:'city_uf_conflict',stopId:'1'}]);
  assert.deepEqual(quote({...base,stops:[{...base.stops[0],city:'Goiânia - MG - Goiás',state:null}]},zone),
    [{code:'city_uf_conflict',stopId:'1'}]);
  assert.deepEqual(quote({...base,stops:[{...base.stops[0],city:'Rua Goiânia - GO',state:null}]},zone),
    [{code:'unmatched_zone',stopId:'1'}]);
  assert.deepEqual(quote({...base,stops:[{...base.stops[0],city:'Goiânia',state:null}]},zone),
    [{code:'unmatched_zone',stopId:'1'}]);
});

test('the rule editor accepts observed Goiás labels and reopens their canonical city/UF form',()=>{
  const definition=(cities:unknown)=>normalizeRule({mode:'zone',zones:[{cities,priceCents:500}]});
  const saved=definition('Goiânia - GO - Goiás, Aparecida de Goiânia - Goiás');
  const readBack=definition('Goiania/GO, Aparecida de Goiania/GO');
  assert.ok(!Array.isArray(saved));
  assert.deepEqual(saved,readBack);
  assert.deepEqual(saved.zones[0].cities,[{name:'goiania',uf:'go'},{name:'aparecida de goiania',uf:'go'}]);
  assert.deepEqual(definition([{name:'Goiânia - GO',uf:'MG'}]),[{code:'city_uf_conflict'}]);
});

test('contradictory terminal state suffixes are a review in both rule and route inputs',()=>{
  const parse=(cities:unknown)=>normalizeRule({mode:'zone',zones:[{cities,priceCents:500}]});
  for (const city of ['Goiânia - MG - GO','Goiânia - GO - MG','Goiânia - MG - Goiás','Goiânia/GO - MG']) {
    assert.deepEqual(parse(city),[{code:'city_uf_conflict'}],city);
    assert.deepEqual(parse([{name:city,uf:'GO'}]),[{code:'city_uf_conflict'}],city);
    assert.deepEqual(quote({...base,stops:[{...base.stops[0],city,state:'GO'}]},zone),
      [{code:'city_uf_conflict',stopId:'1'}],city);
  }
  for (const city of ['Goiânia - GO - GO','Goiânia - GO - Goiás','Goiânia - Goiás - GO','Goiânia/GO - GO']) {
    assert.deepEqual(parse(city),parse('Goiânia/GO'),city);
    const quoted=quote({...base,stops:[{...base.stops[0],city,state:null}]},zone);
    assert.ok(!Array.isArray(quoted),city);
    assert.equal(quoted.totalCents,500,city);
  }
});
