export type ReportOriginSystem = 'luna' | 'rota_exata' | 'unknown';
export type ReportCategory = 'error' | 'improvement';
export type ReportStatus = 'pending' | 'in_progress' | 'resolved';
export type Improvement = { goal: string; currentProcess: string; blocker: string };
export type ReportActor = { uid: string; role?: string; active?: boolean };
export type ReportSummary = {
  id: string;
  originSystem: ReportOriginSystem;
  trustedOrigin: ReportOriginSystem;
  category: ReportCategory;
  description: string;
  improvement: Improvement | null;
  user: { uid?: string; name?: string; email?: string };
  status: ReportStatus;
  createdAt: string | null;
};
type ReportData = {
  originSystem?: unknown;
  schemaVersion?: unknown;
  category?: unknown;
  context?: { url?: unknown } | null;
  description?: unknown;
  improvement?: unknown;
  user?: ReportSummary['user'] | null;
  status?: unknown;
  createdAt?: unknown;
};

const improvementKeys = ['goal', 'currentProcess', 'blocker'] as const;
const hosts = new Map<string, ReportOriginSystem>([
  ['luna-sooty.vercel.app', 'luna'],
  ['rota-exata.vercel.app', 'rota_exata'],
]);

export const REPORT_CREATED_EVENT = 'support-report-created';

export const reportOriginLabels = { luna: 'Luna', rota_exata: 'Rota Exata', unknown: 'Origem a revisar' };
export const reportCategoryLabels = { error: 'Erro', improvement: 'Melhoria' };
export const reportStatusLabels = { pending: 'Pendente', in_progress: 'Em andamento', resolved: 'Resolvido' };

export function getTrustedReportOrigin(report: ReportData): ReportOriginSystem {
  if (report.originSystem === 'luna' || report.originSystem === 'rota_exata') return report.originSystem;
  // Only the legacy Luna server stamped schemaVersion 2. An explicit unknown
  // classification or contradictory official host still requires review.
  return report.originSystem === undefined && report.schemaVersion === 2 &&
    getLegacyReportHost(report) !== 'rota-exata.vercel.app' ? 'luna' : 'unknown';
}

export function getLegacyReportHost(report: ReportData): string | null {
  if (typeof report.context?.url !== 'string') return null;
  try {
    const url = new URL(report.context.url);
    return ['http:', 'https:'].includes(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}

export function resolveReportOrigin(report: ReportData): ReportOriginSystem {
  if (report.originSystem === 'luna' || report.originSystem === 'rota_exata' || report.originSystem === 'unknown') {
    return report.originSystem;
  }
  return hosts.get(getLegacyReportHost(report) ?? '') ?? 'unknown';
}

export function validReportId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,120}$/.test(value);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return value === 'pending' || value === 'in_progress' || value === 'resolved';
}

function parseImprovement(value: unknown): Improvement | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const result = {} as Improvement;
  for (const key of improvementKeys) {
    const text = data[key];
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) return null;
    result[key] = text.trim();
  }
  return result;
}

export function describeImprovement(improvement: Improvement) {
  return [
    `Objetivo: ${improvement.goal}`,
    `Como faz hoje: ${improvement.currentProcess}`,
    `O que atrapalha: ${improvement.blocker}`,
  ].join('\n\n').slice(0, 5000);
}

export function readSubmission(data: { category?: unknown; description?: unknown; improvement?: unknown }) {
  if (data.category === 'improvement') {
    const improvement = parseImprovement(data.improvement);
    return improvement ? { category: 'improvement' as const, improvement, description: describeImprovement(improvement) } : null;
  }
  if (data.category !== 'error' && data.category !== undefined) return null;
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  return description && description.length <= 5000 ? { category: 'error' as const, description, improvement: null } : null;
}

export function serializeReportDate(value: unknown): string | null {
  if (value == null) return null;
  const stamp = value as { _seconds?: number; seconds?: number; _nanoseconds?: number; nanoseconds?: number; toDate?: () => Date };
  const seconds = stamp.seconds ?? stamp._seconds;
  const date = typeof stamp.toDate === 'function' ? stamp.toDate()
    : typeof seconds === 'number' ? new Date(seconds * 1000 + (stamp.nanoseconds ?? stamp._nanoseconds ?? 0) / 1000000)
    : value instanceof Date || typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function normalizeReport(id: string, data: ReportData): ReportSummary {
  const { uid, name, email } = data.user ?? {};
  return {
    id,
    user: { uid, name, email },
    originSystem: resolveReportOrigin(data),
    trustedOrigin: getTrustedReportOrigin(data),
    category: data.category === 'improvement' ? 'improvement' : 'error',
    status: isReportStatus(data.status) ? data.status : 'pending',
    description: typeof data.description === 'string' ? data.description : '',
    improvement: parseImprovement(data.improvement),
    createdAt: serializeReportDate(data.createdAt),
  };
}

export function getReportCapabilities(actor: ReportActor, report: Pick<ReportSummary, 'trustedOrigin' | 'user'>) {
  const active = Boolean(actor.uid) && actor.active !== false;
  const author = active && report.user.uid === actor.uid;
  const manager = actor.role === 'socio' || actor.role === 'gestor';
  const manage = active && (actor.role === 'admin' || (manager && report.trustedOrigin === 'rota_exata'));
  return { view: manage || author, manage, reopen: author };
}

function dayAtUtcMinusThree(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00-03:00`);
  return Number.isFinite(time) ? time : null;
}

function foldText(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function selectReportPage(reports: ReportSummary[], actor: ReportActor, params: URLSearchParams) {
  const [origin, category, status, author, search, from, to] = [
    'origin', 'category', 'status', 'author', 'search', 'from', 'to',
  ].map((key) => (params.get(key) ?? '').slice(0, 200).trim());
  const filters = JSON.stringify([origin, category, status, author, search, from, to, params.get('scope') === 'mine']);
  const authorQuery = foldText(author);
  const searchQuery = foldText(search);
  const start = dayAtUtcMinusThree(from);
  const end = dayAtUtcMinusThree(to);
  const filtered = reports.filter((report) => {
    if (!getReportCapabilities(actor, report).view) return false;
    if (origin && origin !== report.originSystem || category && category !== report.category || status && status !== report.status) return false;
    const date = report.createdAt ? Date.parse(report.createdAt) : Number.NEGATIVE_INFINITY;
    if (start !== null && date < start || end !== null && date >= end + 86400000) return false;
    if (authorQuery && !foldText([report.user.name, report.user.email].join(' ')).includes(authorQuery)) return false;
    return !searchQuery || foldText([report.description, ...Object.values(report.improvement ?? {})].join(' ')).includes(searchQuery);
  }).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id));
  const counts = { total: filtered.length, pending: 0, in_progress: 0, resolved: 0 };
  for (const report of filtered) counts[report.status]++;
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit') ?? '', 10) || 20));
  let offset = 0;
  try {
    const cursor = JSON.parse(params.get('cursor') ?? 'null');
    if (cursor?.filters === filters) {
      const index = filtered.findIndex((report) => report.id === cursor.id && report.createdAt === cursor.createdAt);
      if (index >= 0) offset = index + 1;
    }
  } catch {
    // Invalid cursors start a fresh page.
  }
  const page = filtered.slice(offset, offset + limit);
  const last = page.at(-1);
  return {
    counts,
    reports: page.map((report) => ({ ...report, capabilities: getReportCapabilities(actor, report) })),
    nextCursor: last && offset + limit < filtered.length
      ? JSON.stringify({ filters, id: last.id, createdAt: last.createdAt })
      : null,
  };
}
