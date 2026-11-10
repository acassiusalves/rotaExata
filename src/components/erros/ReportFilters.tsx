'use client';

import { Button } from '@/components/ui/button';
import { reportCategoryLabels, reportOriginLabels, reportStatusLabels } from '@/lib/reporting/report-contract';

export const initialReportFilters = { origin: '', category: '', status: '', author: '', search: '', from: '', to: '' };
export type ReportFilterValues = typeof initialReportFilters;
export type ReportCounts = { total: number; pending: number; in_progress: number; resolved: number };

export function ReportFilters({ values, onChange, counts }: {
  values: ReportFilterValues;
  onChange: (next: ReportFilterValues) => void;
  counts?: ReportCounts;
}) {
  const input = 'min-w-0 rounded-md border bg-background px-2 py-2 text-sm';
  const selectors = [
    ['origin', 'Sistema', reportOriginLabels],
    ['category', 'Tipo', reportCategoryLabels],
    ['status', 'Status', reportStatusLabels],
  ] as const;
  const fields = [
    ['search', 'Buscar chamados', 'search'],
    ['author', 'Autor', 'search'],
    ['from', 'De', 'date'],
    ['to', 'Até', 'date'],
  ] as const;
  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {selectors.map(([key, label, options]) => (
          <label key={key} className="grid gap-1 text-sm font-medium">
            {label}
            <select aria-label={label} className={input} value={values[key]} onChange={(event) => onChange({ ...values, [key]: event.target.value })}>
              <option value="">Todos</option>
              {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
        ))}
        {fields.map(([key, label, type]) => (
          <label key={key} className="grid gap-1 text-sm font-medium">
            {label}
            <input aria-label={label} type={type} className={input} value={values[key]} onChange={(event) => onChange({ ...values, [key]: event.target.value })} />
          </label>
        ))}
        <Button variant="outline" type="button" className="self-end" onClick={() => onChange(initialReportFilters)}>Limpar filtros</Button>
      </div>
      {counts && (
        <p aria-live="polite" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <strong>{counts.total} chamados</strong>
          <span>{counts.pending} pendentes</span>
          <span>{counts.in_progress} em andamento</span>
          <span>{counts.resolved} resolvidos</span>
        </p>
      )}
    </div>
  );
}
