import { z } from 'zod';
import { factsHash, timestampIso } from '../../../../functions/src/earnings-source-adapter.ts';

const docId = z.string().min(1).max(1500).regex(/^[^/]+$/);
const data = z.record(z.unknown());
const documentSchema = z.object({ documentId: docId, data });
const snapshotSchema = z.object({
  sourceProject: z.string().regex(/^[a-z0-9-]{3,63}$/),
  sourceCutoff: z.string().datetime(),
  legacyRule: data.nullable(),
  payments: z.array(documentSchema.extend({ sourceRevision: z.string().regex(/^\d{12}\.\d{9}$/) })),
  routes: z.array(documentSchema).optional(),
});

export function brlToCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = String(value).trim();
  const match = raw.match(/^([+-]?)(\d{1,25})(?:\.(\d{1,25}))?(?:e([+-]?\d{1,2}))?$/i);
  if (!match) return null;
  const [, sign, whole, part = '', exponent = '0'] = match;
  const scale = part.length - 2 - Number(exponent);
  const numerator = BigInt(whole + part);
  const ten = BigInt(10);
  const divisor = ten ** BigInt(Math.max(0,scale));
  const rounded = scale <= 0 ? numerator * ten ** BigInt(-scale) : (numerator + divisor / BigInt(2)) / divisor;
  const signed = sign === '-' ? -rounded : rounded;
  const cents = Number(signed);
  return Number.isSafeInteger(cents) ? cents : null;
}

const statuses = new Set(['pending','approved','paid','cancelled']);
const components = [
  ['basePay','base'], ['distanceEarnings','distance'], ['deliveryBonuses','delivery'],
  ['failedAttemptBonuses','attempt'], ['timeBonusAmount','multiplier'], ['stopTierBonus','volume'], ['lunnaBonus','lunna'],
] as const;
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
function safeText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value : null;
}

export function prepareLegacyBatch(input: unknown) {
  const source = snapshotSchema.parse(input);
  const byRoute = new Map<string,number>();
  const seenDocuments = new Set<string>();
  const knownRoutes = source.routes ? new Set(source.routes.map(row => row.documentId)) : null;
  for (const row of source.payments) {
    if (seenDocuments.has(row.documentId)) throw new Error('duplicate_payment_document');
    seenDocuments.add(row.documentId);
    const routeId = safeText(row.data.routeId,150);
    if (routeId) byRoute.set(routeId,(byRoute.get(routeId) ?? 0) + 1);
  }

  const rows = source.payments.map(row => {
    const input = row.data;
    const routeId = safeText(input.routeId,150);
    const driverUid = safeText(input.driverId,128);
    const status = typeof input.status === 'string' && statuses.has(input.status) ? input.status : null;
    const cents = brlToCents(input.totalEarnings);
    const totalCents = cents !== null && cents >= 0 ? cents : null;
    const version = typeof input.rulesVersion === 'number' && Number.isInteger(input.rulesVersion) && Number(input.rulesVersion)>0 && Number(input.rulesVersion)<=2147483647 ? input.rulesVersion : null;
    const workedAt = timestampIso(input.routeCompletedAt);
    const manualPaidAt = timestampIso(input.paidAt);
    const planned = timestampIso(input.routePlannedDate);
    const plannedAt = planned ? day.format(new Date(planned)) : safeText(input.routePlannedDate,10)?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? null;
    const breakdown = data.safeParse(input.breakdown);
    const itemValues = components.flatMap(([field, component]) => {
      const amount = breakdown.success ? brlToCents(breakdown.data[field]) : null;
      return amount !== null && amount > 0 ? [{ key: 'historic:' + component, component, cents: amount }] : [];
    });
    const componentTotal = itemValues.reduce((sum,item) => sum + item.cents,0);
    const reviewReasons: string[] = [];
    if (!routeId) reviewReasons.push('route_id_missing');
    if (routeId && (byRoute.get(routeId) ?? 0) > 1) reviewReasons.push('duplicate_route');
    if (routeId && knownRoutes && !knownRoutes.has(routeId)) reviewReasons.push('orphan_route');
    if (!driverUid) reviewReasons.push('driver_uid_missing');
    if (!workedAt) reviewReasons.push('work_time_missing');
    if (!status) reviewReasons.push('status_unknown');
    if (status === 'paid' && !manualPaidAt) reviewReasons.push('paid_time_missing');
    if (totalCents === null) reviewReasons.push('amount_invalid');
    if (input.id !== undefined && input.id !== row.documentId) reviewReasons.push('embedded_id_mismatch');
    if (!breakdown.success) reviewReasons.push('breakdown_missing');
    if (breakdown.success && totalCents !== null && componentTotal !== totalCents && brlToCents(breakdown.data.subtotal) !== totalCents) {
      reviewReasons.push('components_do_not_reconcile');
    }
    const items = totalCents !== null && itemValues.length && componentTotal === totalCents
      ? itemValues : totalCents !== null ? [{ key: 'historic:total', component: 'historical', cents: totalCents }] : [];
    return {
      documentId: row.documentId, sourceRevision: row.sourceRevision,
      fingerprint: factsHash({ revision: row.sourceRevision, data: input }),
      routeId, driverUid, status, totalCents, version, workedAt, plannedAt,
      paidAt: manualPaidAt, noOriginalRuleSnapshot: !input.ruleSnapshot, items, reviewReasons, original: input,
    };
  });
  const counts: Record<string,number> = {};
  const totalsByStatus: Record<string,bigint> = {};
  const reasons: Record<string,number> = {};
  const versions: Record<string,number> = {};
  const byCompetence: Record<string,{ count: number; cents: bigint }> = {};
  let total = BigInt(0);
  for (const row of rows) {
    const status = row.status ?? 'unknown';
    const cents = BigInt(row.totalCents ?? 0);
    counts[status] = (counts[status] ?? 0) + 1;
    totalsByStatus[status] = (totalsByStatus[status] ?? BigInt(0)) + cents;
    versions[String(row.version)] = (versions[String(row.version)] ?? 0) + 1;
    for (const reason of row.reviewReasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
    const key = row.workedAt ? day.format(new Date(row.workedAt)).slice(0,7) : 'unknown';
    const period = byCompetence[key] ?? { count: 0, cents: BigInt(0) };
    byCompetence[key] = { count: period.count + 1, cents: period.cents + cents };
    total += cents;
  }
  const unaccounted = source.routes?.filter(route => !byRoute.has(route.documentId)) ?? [];
  const auto = unaccounted.filter(route => route.data.status === 'completed_auto');
  const report = {
    sourceProject: source.sourceProject, sourceCutoff: source.sourceCutoff,
    rows, legacyRule: source.legacyRule,
    summary: {
      payments: rows.length, routes: source.routes?.length ?? null,
      legacyRuleVersion: source.legacyRule?.version ?? null,
      withBreakdown: rows.length - (reasons.breakdown_missing ?? 0),
      countByStatus: counts, countByVersion: versions,
      sumCents: String(total), sumByStatusCents: Object.fromEntries(Object.entries(totalsByStatus).map(([key,value]) => [key,String(value)])),
      byCompetence: Object.fromEntries(Object.entries(byCompetence).map(([key,{ count,cents }]) => [key,{ count, cents: String(cents) }])),
      missingUid: reasons.driver_uid_missing ?? 0, zeroV2: rows.filter(row => row.totalCents === 0 && row.version === 2).length,
      noOriginalRuleSnapshot: rows.filter(row => row.noOriginalRuleSnapshot).length,
      reviewReasons: reasons,
      completedWithoutPayment: unaccounted.filter(route => route.data.status === 'completed').length,
      completedAutoWithoutPayment: auto.length,
      completedAutoWithoutDate: auto.filter(route => !timestampIso(route.data.completedAt)).length,
    },
  };
  return { ...report, fingerprint: factsHash({ sourceProject: report.sourceProject, sourceCutoff: report.sourceCutoff, payments: rows.map(row => row.fingerprint), rule: source.legacyRule }) };
}
