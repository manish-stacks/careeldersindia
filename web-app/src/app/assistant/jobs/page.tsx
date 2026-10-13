'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaged } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton, Pagination, Tabs } from '@/components/ui/misc';
import { JobRow, type Job } from '@/components/portal/job-row';

type Scope = 'new' | 'today' | 'upcoming' | 'history';

export default function JobsPage() {
  const [scope, setScope] = useState<Scope>('new');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['assistant', 'jobs', scope, page], queryFn: () => getPaged<Job>(`/assistant/jobs?scope=${scope}&page=${page}&limit=15`) });
  return (
    <div className="space-y-5">
      <PageHeader title="My jobs" subtitle="Accept new jobs and manage your visits." />
      <Tabs value={scope} onChange={(v) => { setScope(v); setPage(1); }} items={[{ value: 'new', label: 'New' }, { value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'history', label: 'History' }]} />
      {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Panel bodyClass="p-0 divide-y divide-line">
          {q.data?.items.length ? q.data.items.map((j) => <JobRow key={j._id} j={j} />) : <Empty title="Nothing here" />}
        </Panel>
      )}
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </div>
  );
}
