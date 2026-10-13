'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton } from '@/components/ui/misc';

export default function EarningsPage() {
  const q = useQuery({ queryKey: ['assistant', 'earnings'], queryFn: () => get<{ months: { month: string; completedVisits: number }[] }>('/assistant/earnings?months=6') });
  const max = Math.max(1, ...(q.data?.months.map((m) => m.completedVisits) || [1]));
  return (
    <div className="space-y-5">
      <PageHeader title="Earnings" subtitle="Completed visits for the last 6 months." />
      {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Panel>
          {q.data?.months.length ? (
            <ul className="space-y-3">
              {q.data.months.map((m) => (
                <li key={m.month} className="flex items-center gap-3">
                  <span className="w-20 text-sm text-ink-muted">{m.month}</span>
                  <div className="h-3 flex-1 rounded-full bg-canvas"><div className="h-3 rounded-full bg-brand" style={{ width: `${(m.completedVisits / max) * 100}%` }} /></div>
                  <span className="w-20 text-right text-sm font-semibold">{m.completedVisits} visits</span>
                </li>
              ))}
            </ul>
          ) : <Empty title="No completed visits yet" />}
        </Panel>
      )}
    </div>
  );
}
