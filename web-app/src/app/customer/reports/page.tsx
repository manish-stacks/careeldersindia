'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaged } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton, Pagination } from '@/components/ui/misc';
import { OverallBadge } from '@/components/ui/status';
import { PdfButton } from '@/components/portal/pdf-button';
import { dateOnly } from '@/lib/utils';
import type { OverallStatus } from '@/lib/types';

type Rep = { _id: string; reportNumber: string; visitDate: string; overallStatus: OverallStatus; followUpRequired?: boolean; serviceName?: string; data?: { patient?: { name?: string }; assistant?: { name?: string } } };

export default function ReportsPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['customer', 'reports', page], queryFn: () => getPaged<Rep>(`/reports?page=${page}&limit=15`) });
  return (
    <div className="space-y-5">
      <PageHeader title="Health reports" subtitle="A report is created after every completed visit." />
      {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Panel bodyClass="p-0 divide-y divide-line">
          {q.data?.items.length ? q.data.items.map((r) => (
            <div key={r._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold">{r.data?.patient?.name} · {r.serviceName}</p>
                <p className="text-sm text-ink-muted">{dateOnly(r.visitDate)} · {r.reportNumber}{r.data?.assistant?.name ? ` · by ${r.data.assistant.name}` : ''}{r.followUpRequired ? ' · follow-up advised' : ''}</p>
              </div>
              <div className="flex items-center gap-2"><OverallBadge status={r.overallStatus} /><PdfButton reportId={r._id} /></div>
            </div>
          )) : <Empty title="No reports yet" body="Your first report will appear after a visit is completed." />}
        </Panel>
      )}
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </div>
  );
}
