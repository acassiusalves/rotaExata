import { z } from 'zod';

const cents = z.number().int().min(0).max(1_000_000_000);
const id = z.string().trim().min(1).max(150);
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const municipality = z.object({ name: z.string().trim().min(1).max(120), uf: z.string().trim().length(2).optional(), fullName: z.string().max(250).optional() });
const cityInput = z.union([
  z.string().max(12000).transform(value => value.split(',').map(city => city.trim()).filter(Boolean)),
  z.array(z.union([z.string().trim().min(1).max(120), municipality])).max(100),
]).pipe(z.array(z.union([z.string().trim().min(1).max(120), municipality])).min(1).max(100));

const zoneSchema = z.object({
  cities: cityInput,
  priceCents: cents,
  radiusMeters: z.number().int().min(1).max(10000000).optional(),
  label: z.string().trim().max(100).optional(),
});
const ruleSchema = z.object({
  mode: z.enum(['zone', 'distance', 'hybrid']),
  zones: z.array(zoneSchema).max(100).optional(),
  attemptBasisPoints: cents.max(10000).optional(),
  baseCents: cents.optional(),
  kilometerCents: cents.optional(),
  deliveryCents: cents.optional(),
  attemptCents: cents.optional(),
  distanceSource: z.literal('planned').default('planned'),
  partial: z.enum(['review', 'settle_confirmed']).default('review'),
  excludedCategories: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  lunnaCents: cents.default(0),
  volume: z.array(z.object({ minimum: z.number().int().min(1).max(1000), cents })).max(30).default([]),
  multipliers: z.array(z.discriminatedUnion('period', [
    z.object({ period: z.literal('weekend'), basisPoints: cents.min(10000).max(100000) }),
    z.object({
      period: z.enum(['morning', 'night']),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      basisPoints: cents.min(10000).max(100000),
    }),
  ])).max(3).default([]),
});

const stopSchema = z.object({
  id,
  status: z.enum(['completed', 'failed', 'open']),
  visited: z.boolean().nullish(),
  city: z.string().trim().max(120).nullish(),
  state: z.string().trim().max(30).nullish(),
  lat: point.shape.lat.nullish(),
  lng: point.shape.lng.nullish(),
  category: z.string().trim().max(80).nullish(),
  lunna: z.boolean().nullish(),
  exception: z.enum(['exchange', 'return', 'redelivery', 'moved']).nullish(),
});

function validDate(value: string) {
  const day = value.slice(0, 10);
  const date = new Date(day + 'T00:00:00.000Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(day);
}
const factsSchema = z.object({
  workedAt: z.string().datetime({ offset: true }).refine(validDate),
  plannedAt: z.string().date().refine(validDate).nullish(),
  distanceMeters: z.number().int().min(0).max(10000000).nullish(),
  origin: point.nullish(),
  stops: z.array(stopSchema).min(1).max(1000),
});

export type EarningsIssue = { code: string; stopId?: string };
export type EarningsFacts = z.infer<typeof factsSchema>;
export type EarningsRule = Omit<z.infer<typeof ruleSchema>, 'zones'> & {
  zones: (Omit<z.infer<typeof zoneSchema>, 'cities'> & { cities: z.infer<typeof municipality>[] })[];
};
export type EarningsItem = {
  key: string;
  component: 'base' | 'distance' | 'delivery' | 'attempt' | 'lunna' | 'volume' | 'multiplier';
  stopId?: string;
  unit: 'route' | 'stop' | 'meter' | 'basis_point';
  quantity: number;
  rateCents: number;
  cents: number;
};
export type EarningsQuote = {
  engineVersion: 1;
  competence: string;
  workedAt: string;
  plannedAt: string | null;
  items: EarningsItem[];
  totalCents: number;
};

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function municipalityIdentity(value: string, state?: string | null) {
  const city = fold(value);
  const qualified = /^(.+?) - (?:(?:([a-z]{2}) - )?goias|go)$/.exec(city);
  const declaredState = state ? fold(state) : undefined;
  const explicitUf = declaredState === 'goias' ? 'go' : declaredState || undefined;
  const suffixUf = qualified ? 'go' : undefined;
  const conflict = !!((qualified?.[2] && qualified[2] !== suffixUf) ||
    (suffixUf && explicitUf && explicitUf !== suffixUf));
  return { name: qualified?.[1] ?? city, uf: explicitUf ?? suffixUf, conflict };
}

export function normalizeRule(input: unknown): EarningsRule | EarningsIssue[] {
  const result = ruleSchema.safeParse(input);
  if (!result.success) return result.error.issues.map(issue => ({ code: 'invalid_rule:' + issue.path.join('.') }));
  const { zones, ...rule } = result.data;
  if (rule.mode === 'hybrid') return [{ code: 'unsupported_hybrid' }];
  if (rule.mode === 'zone' && !zones?.length) return [{ code: 'missing_zones' }];
  if (rule.mode === 'distance' && [rule.baseCents, rule.kilometerCents, rule.deliveryCents, rule.attemptCents].some(value => value === undefined)) {
    return [{ code: 'missing_distance_rates' }];
  }
  if (new Set(rule.volume.map(tier => tier.minimum)).size !== rule.volume.length ||
      new Set(rule.multipliers.map(multiplier => multiplier.period)).size !== rule.multipliers.length ||
      rule.multipliers.some(multiplier => multiplier.period !== 'weekend' && multiplier.startHour >= multiplier.endHour)) {
    return [{ code: 'conflicting_brackets' }];
  }
  let conflictingCityUf = false;
  const normalizedZones = (zones ?? []).map(zone => ({
    ...zone,
    cities: zone.cities.map(city => {
      const [name, state] = typeof city === 'string'
        ? city.split(/\s*[\/-]\s*(?=[A-Za-z]{2}$)/)
        : [city.name, city.uf ?? city.fullName?.match(/,\s*([A-Za-z]{2})$/)?.[1]];
      const normalized = municipalityIdentity(name, state);
      conflictingCityUf ||= normalized.conflict;
      return { name: normalized.name, ...(normalized.uf ? { uf: normalized.uf } : {}) };
    }),
  }));
  if (conflictingCityUf) return [{ code: 'city_uf_conflict' }];
  if (normalizedZones.some(zone => zone.cities.some(city => !city.name))) return [{ code: 'invalid_city' }];
  return { ...rule, zones: normalizedZones, excludedCategories: rule.excludedCategories.map(fold) };
}

export function normalizeRouteFacts(input: unknown): EarningsFacts | EarningsIssue[] {
  const result = factsSchema.safeParse(input);
  if (!result.success) return result.error.issues.map(issue => ({ code: 'invalid_facts:' + issue.path.join('.') }));
  if (new Set(result.data.stops.map(stop => stop.id)).size !== result.data.stops.length) return [{ code: 'duplicate_stop' }];
  return { ...result.data, workedAt: new Date(result.data.workedAt).toISOString() };
}

const localTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

function localParts(instant: string) {
  const fields = Object.fromEntries(localTime.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return { competence: fields.year + '-' + fields.month + '-01', hour: Number(fields.hour), weekend: ['Sat', 'Sun'].includes(fields.weekday) };
}

function straightLineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLng = (lng2 - lng1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function zoneRate(stop: EarningsFacts['stops'][number], origin: EarningsFacts['origin'], rule: EarningsRule): number | EarningsIssue {
  const code = (value: string) => ({ code: value, stopId: stop.id });
  const city = municipalityIdentity(stop.city ?? '', stop.state);
  if (city.conflict) return code('city_uf_conflict');
  for (const zone of rule.zones) {
    if (!zone.cities.some(place => place.name === city.name && (!place.uf || place.uf === city.uf))) continue;
    if (!zone.radiusMeters) return zone.priceCents;
    if (!origin) return code('missing_origin');
    if (stop.lat == null || stop.lng == null) return code('missing_stop_coordinates');
    if (straightLineMeters(origin.lat, origin.lng, stop.lat, stop.lng) <= zone.radiusMeters + 0.000001) return zone.priceCents;
  }
  return code('unmatched_zone');
}

function roundPrice(rate: number, quantity: number, divisor: number) {
  return Number((BigInt(rate) * BigInt(quantity) + BigInt(divisor / 2)) / BigInt(divisor));
}

export function calculateEarnings(facts: EarningsFacts, rule: EarningsRule): EarningsQuote | EarningsIssue[] {
  const items: EarningsItem[] = [];
  const issues: EarningsIssue[] = [];
  if (rule.mode === 'hybrid') return [{ code: 'unsupported_hybrid' }];
  if (rule.mode === 'distance') {
    if (facts.distanceMeters == null) return [{ code: 'missing_planned_distance' }];
    items.push(
      { key: 'base', component: 'base', unit: 'route', quantity: 1, rateCents: rule.baseCents!, cents: rule.baseCents! },
      { key: 'distance', component: 'distance', unit: 'meter', quantity: facts.distanceMeters, rateCents: rule.kilometerCents!, cents: roundPrice(rule.kilometerCents!, facts.distanceMeters, 1000) },
    );
  }
  const successful = facts.stops.filter(stop => stop.status === 'completed');
  for (const stop of facts.stops) {
    if (stop.exception) {
      issues.push({ code: 'policy_required:' + stop.exception, stopId: stop.id });
      continue;
    }
    if (stop.status === 'open') {
      if (rule.partial !== 'settle_confirmed' || rule.mode !== 'zone') issues.push({ code: 'partial_work', stopId: stop.id });
      continue;
    }
    if (stop.status === 'failed' && stop.visited == null) {
      issues.push({ code: 'unknown_attempt', stopId: stop.id });
      continue;
    }
    if (stop.status === 'failed' && !stop.visited) continue;
    if (rule.excludedCategories.length && (!stop.category || rule.excludedCategories.includes(fold(stop.category)))) {
      issues.push({ code: 'exclusion_review', stopId: stop.id });
      continue;
    }
    const delivery = stop.status === 'completed';
    let amount: number;
    if (rule.mode === 'zone') {
      if (!delivery && rule.attemptBasisPoints === undefined) {
        issues.push({ code: 'missing_attempt_policy', stopId: stop.id });
        continue;
      }
      const zone = zoneRate(stop, facts.origin, rule);
      if (typeof zone !== 'number') { issues.push(zone); continue; }
      amount = delivery ? zone : roundPrice(zone, rule.attemptBasisPoints!, 10000);
    } else {
      amount = delivery ? rule.deliveryCents! : rule.attemptCents!;
    }
    items.push({ key: 'stop:' + stop.id, stopId: stop.id, component: delivery ? 'delivery' : 'attempt', unit: 'stop', quantity: 1, rateCents: amount, cents: amount });
  }
  if (rule.lunnaCents && successful.some(stop => stop.lunna == null)) issues.push({ code: 'unknown_lunna_classification' });
  if (issues.length) return issues;

  const local = localParts(facts.workedAt);
  const multiplier = Math.max(10000, ...rule.multipliers.filter(entry =>
    entry.period === 'weekend' ? local.weekend : local.hour >= entry.startHour && local.hour < entry.endHour,
  ).map(entry => entry.basisPoints));
  if (multiplier > 10000) {
    const variable = items.reduce((sum, item) => sum + item.cents, 0);
    items.push({ key: 'multiplier', component: 'multiplier', unit: 'basis_point', quantity: multiplier - 10000, rateCents: variable, cents: roundPrice(variable, multiplier - 10000, 10000) });
  }
  const lunna = successful.filter(stop => stop.lunna);
  if (rule.lunnaCents && lunna.length) {
    items.push({ key: 'lunna', component: 'lunna', unit: 'stop', quantity: lunna.length, rateCents: rule.lunnaCents, cents: lunna.length * rule.lunnaCents });
  }
  const tier = rule.volume.reduce<typeof rule.volume[number] | undefined>((best, value) =>
    value.minimum <= successful.length && (!best || value.minimum > best.minimum) ? value : best, undefined);
  if (tier) items.push({ key: 'volume', component: 'volume', unit: 'route', quantity: 1, rateCents: tier.cents, cents: tier.cents });

  if (!items.length) return [{ code: 'no_payable_work' }];
  const totalCents = items.reduce((sum, item) => sum + item.cents, 0);
  if (!Number.isSafeInteger(totalCents)) return [{ code: 'total_out_of_range' }];
  return { engineVersion: 1, competence: local.competence, workedAt: facts.workedAt, plannedAt: facts.plannedAt ?? null, items, totalCents };
}
