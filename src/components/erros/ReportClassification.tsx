import {
  reportCategoryLabels, reportOriginLabels, type Improvement, type ReportCategory, type ReportOriginSystem,
} from '@/lib/reporting/report-contract';

export function ReportClassification({ origin, category }: { origin: ReportOriginSystem; category: ReportCategory }) {
  return (
    <span className="inline-flex flex-wrap gap-1 text-xs">
      <span className="rounded-full border bg-muted px-2 py-1 font-medium">{reportOriginLabels[origin]}</span>
      <span className="rounded-full border px-2 py-1 font-medium">{reportCategoryLabels[category]}</span>
    </span>
  );
}

export function ReportImprovement({ improvement }: { improvement: Improvement }) {
  const fields = [
    ['O que quer conseguir', improvement.goal],
    ['Como faz hoje', improvement.currentProcess],
    ['O que atrapalha', improvement.blocker],
  ];
  return (
    <dl className="grid gap-3 rounded-md border bg-muted/30 p-4">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm font-semibold">{label}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
