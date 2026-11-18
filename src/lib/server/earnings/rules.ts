import { z } from 'zod';
import { calculateEarnings, normalizeRouteFacts, normalizeRule } from '../../earnings/domain.ts';
import type { EarningsActor } from './actor.ts';
import { actorRpc } from './store.ts';
import { EarningsError } from './transport.ts';

export async function loadRule(actor: EarningsActor) {
  return actorRpc(actor,'rota_earnings_get_rule');
}

export async function publishRule(actor: EarningsActor,input: unknown) {
  const draft = z.object({ expectedVersion: z.number().int().min(0), effectiveAt: z.string().datetime().nullish(), rule: z.unknown() }).strict().safeParse(input);
  if (!draft.success) throw new EarningsError(422,'earnings_invalid_rule');
  const rule = normalizeRule(draft.data.rule);
  if (Array.isArray(rule)) return { issues: rule };
  return actorRpc(actor,'rota_earnings_publish_rule',{
    p_expected_version: draft.data.expectedVersion,p_effective_at: draft.data.effectiveAt ?? null,p_definition: rule,
  });
}

export function previewRule(input: unknown) {
  const parsed = z.object({ facts: z.unknown(), rule: z.unknown() }).strict().safeParse(input);
  if (!parsed.success) throw new EarningsError(422,'earnings_invalid_rule');
  const rule = normalizeRule(parsed.data.rule);
  if (Array.isArray(rule)) return { issues: rule };
  const facts = normalizeRouteFacts(parsed.data.facts);
  if (Array.isArray(facts)) return { issues: facts };
  const calculation = calculateEarnings(facts,rule);
  return Array.isArray(calculation) ? { issues: calculation } : { quote: calculation };
}
