'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Star } from 'lucide-react';
import { getPaged } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { cn, toQuery } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table';
import { Avatar, Empty, ErrorState, PageHeader, Pagination, Tabs } from '@/components/ui/misc';
import { Input } from '@/components/ui/form';
import { VerificationBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { AddUserDialog, RowActions } from '@/components/people/admin-dialogs';

type Row = {
  _id: string; verificationStatus: string; isOnline: boolean; isAvailable: boolean; experienceYears: number; languages: string[]; qualification?: string;
  serviceAreas: { city: string; pincodes: string[] }[]; rating: { avg: number; count: number }; stats: { completedVisits: number }; jobsToday: number;
  userId: { _id: string; name: string; email: string; mobile?: string; status: string };
};
type Filter = 'all' | 'review' | 'APPROVED' | 'REJECTED';

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Filter>(sp.get('verificationStatus') ? 'review' : 'all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const search = useDebounced(q);
  const params = { q: search, page, limit: 25, verificationStatus: tab === 'all' ? undefined : tab === 'review' ? 'PENDING,DOCUMENT_REVIEW' : tab };
  const list = useQuery({ queryKey: ['assistants', params], queryFn: () => getPaged<Row>(`/admin/assistants${toQuery(params)}`), placeholderData: keepPreviousData });
  const review = useQuery({ queryKey: ['assistants', 'review-count'], queryFn: () => getPaged<Row>('/admin/assistants?verificationStatus=PENDING,DOCUMENT_REVIEW&limit=1') });

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Assistant',
      cell: (a) => (
        <div className="flex items-center gap-3">
          <span className="relative">
            <Avatar name={a.userId?.name} />
            <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white', a.isOnline ? 'bg-ok' : 'bg-line-strong')} title={a.isOnline ? 'Online' : 'Offline'} />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{a.userId?.name}</p>
            <p className="truncate text-sm text-ink-muted">{a.qualification || '—'} · {a.experienceYears} yrs</p>
          </div>
        </div>
      ),
    },
    { key: 'areas', header: 'Serves', hideBelow: 'md', cell: (a) => <span className="text-sm">{a.serviceAreas.map((s) => (s.pincodes.length ? `${s.city} (${s.pincodes.length} PINs)` : s.city)).join(', ') || '—'}</span> },
    { key: 'lang', header: 'Languages', hideBelow: 'lg', cell: (a) => <span className="text-sm">{a.languages.join(', ')}</span> },
    { key: 'work', header: 'Today / total', cell: (a) => <span>{a.jobsToday} <span className="text-ink-muted">/ {a.stats?.completedVisits ?? 0}</span></span> },
    { key: 'rating', header: 'Rating', hideBelow: 'md', cell: (a) => (a.rating?.count ? <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-current text-warn" />{a.rating.avg.toFixed(1)}</span> : '—') },
    { key: 'v', header: 'Verification', cell: (a) => <div className="space-y-1"><VerificationBadge status={a.verificationStatus} />{a.userId?.status !== 'ACTIVE' && <p className="text-sm text-danger">Login off</p>}{!a.isAvailable && a.userId?.status === 'ACTIVE' && <p className="text-sm text-ink-muted">Unavailable</p>}</div> },
    { key: 'act', header: '', cell: (a) => <RowActions href={`/assistants/${a.userId?._id}`} name={a.userId?.name || 'assistant'} userId={a.userId?._id} role="ASSISTANT" /> },
  ];

  return (
    <>
      <PageHeader title="Assistants" subtitle="Only approved assistants with a checked government ID can be sent to a home." actions={<><Link href="/assistants/workload" className="inline-flex h-11 items-center rounded-lg border border-line bg-white px-4 font-semibold hover:bg-canvas">Workload report</Link><Button onClick={() => setAdding(true)}>+ Add assistant</Button></>} />
      {adding && <AddUserDialog role="ASSISTANT" onClose={() => setAdding(false)} />}
      <div className="panel">
        <div className="px-5 pt-2">
          <Tabs<Filter> value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'all', label: 'All' }, { value: 'review', label: 'To review', count: review.data?.meta.total }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} />
        </div>
        <div className="border-b border-line p-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
            <Input aria-label="Search assistants" className="pl-9" placeholder="Name, email or mobile" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(a) => router.push(`/assistants/${a.userId._id}`)} empty={<Empty title="No assistants here" />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
    </>
  );
}

export default function AssistantsPage() {
  return <Suspense><Inner /></Suspense>;
}
