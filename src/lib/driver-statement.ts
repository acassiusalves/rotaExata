export const earningsStatuses = ['pending','approved','paid','cancelled'] as const;
export type EarningsStatus = typeof earningsStatuses[number];
export const earningsStatusLabel: Record<EarningsStatus,string> = {
  pending: 'A conferir', approved: 'Aprovado', paid: 'Pago', cancelled: 'Cancelado',
};
export const earningsComponentLabel: Record<string,string> = {
  base: 'Valor por rota', distance: 'Distância', delivery: 'Entrega', attempt: 'Tentativa com visita',
  lunna: 'Pedidos Lunna', volume: 'Bônus por volume', multiplier: 'Bônus de horário',
  historical: 'Valor registrado no sistema anterior', adjustment: 'Ajuste',
};
export type EarningsCursor = { workedAt: string; id: string };
export type EarningsTotals = Partial<Record<EarningsStatus,{ count: number; cents: string }>>;
export type StatementLine = { component: string; cents: number; quantity: number; unit: string };
export type StatementRow = {
  id: string;
  route_reference: string;
  under_review: boolean;
  worked_at: string;
  planned_at: string | null;
  status: EarningsStatus;
  revision: number;
  original_cents: number;
  total_cents: number;
  paid_at: string | null;
  lines: StatementLine[];
  historical: boolean;
};
export type StatementPage = {
  rows: StatementRow[]; totals: EarningsTotals; nextCursor: EarningsCursor | null;
  progress: { routeId: string; routeReference: string; status:'processing'|'review'; workedAt:string|null }[];
};
const brl = new Intl.NumberFormat('pt-BR',{ style: 'currency', currency: 'BRL' });

export function displayCents(cents: number | string | undefined) {
  const value = BigInt(cents ?? 0);
  const whole = value / BigInt(100);
  const fraction = (value < BigInt(0) ? -value : value) % BigInt(100);
  const sign = value < BigInt(0) && whole === BigInt(0) ? -0 : whole;
  return brl.formatToParts(sign).map(part => part.type === 'fraction' ? String(fraction).padStart(2,'0') : part.value).join('');
}
const competence = new Intl.DateTimeFormat('en-CA',{ timeZone: 'America/Sao_Paulo',year: 'numeric', month: '2-digit' });
const localDate = new Intl.DateTimeFormat('pt-BR',{ timeZone: 'America/Sao_Paulo',dateStyle: 'short' });

export function currentCompetence(now = new Date()) {
  const parts = Object.fromEntries(competence.formatToParts(now).map(part => [part.type,part.value]));
  return parts.year + '-' + parts.month;
}
export function displayWorkedAt(iso: string | null) {
  return iso ? localDate.format(new Date(iso)) : '—';
}
export function periodQuery(month: string,status: string,cursor: EarningsCursor | null) {
  const search = new URLSearchParams({ month });
  if (status) search.set('status',status);
  if (cursor) {
    search.set('after',cursor.workedAt);
    search.set('afterId',cursor.id);
  }
  return search.toString();
}
