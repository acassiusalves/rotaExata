'use client';

import { useId } from 'react';
import { Textarea } from '@/components/ui/textarea';
import type { Improvement, ReportCategory } from '@/lib/reporting/report-contract';

export type ReportDraft = { category: ReportCategory; description: string; improvement: Improvement };
export const emptyReportDraft: ReportDraft = {
  category: 'error', description: '', improvement: { goal: '', currentProcess: '', blocker: '' },
};

const fields = [
  ['goal', 'O que quer conseguir?'],
  ['currentProcess', 'Como faz hoje?'],
  ['blocker', 'O que atrapalha?'],
] as const;

export function ReportForm({ draft, onChange, disabled }: {
  draft: ReportDraft;
  onChange: (draft: ReportDraft) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="grid gap-1 text-sm font-medium">
        Tipo de chamado
        <select id={id} className="rounded-md border bg-background px-3 py-2" value={draft.category}
          disabled={disabled} onChange={(event) => onChange({ ...draft, category: event.target.value as ReportCategory })}>
          <option value="error">Erro</option>
          <option value="improvement">Melhoria</option>
        </select>
      </label>
      {draft.category === 'error' ? (
        <label className="grid gap-1 text-sm font-medium">
          O que aconteceu?
          <Textarea value={draft.description} maxLength={5000} rows={4} disabled={disabled}
            onChange={(event) => onChange({ ...draft, description: event.target.value })} />
        </label>
      ) : fields.map(([field, label]) => (
        <label key={field} className="grid gap-1 text-sm font-medium">
          {label}
          <Textarea value={draft.improvement[field]} maxLength={2000} rows={2} disabled={disabled}
            onChange={(event) => onChange({ ...draft, improvement: { ...draft.improvement, [field]: event.target.value } })} />
        </label>
      ))}
    </>
  );
}
