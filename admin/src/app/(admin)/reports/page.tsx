'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { get, getPaged, post } from '@/lib/api';
import { useAction, useDebounced } from '@/lib/hooks';
import { dateTime, humanize, toQuery } from '@/lib/utils';
import type { OverallStatus } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/table';
import { Empty, ErrorState, PageHeader, Pagination, Panel, Tabs } from '@/components/ui/misc';
import { Badge, OverallBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';

type Row = { _id: string; reportNumber: string; visitDate: string; overallStatus: OverallStatus; followUpRequired: boolean; serviceName: string; version: number; pdf?: { status: string }; data: { patient: { name: string; city: string }; assistant: { name: string }; visit: { bookingNumber: string } } };
type Correction = { _id: string; visitId: string; bookingId: string; bookingNumber: string; parentName: string; requestedByName: string; correction: { _id: string; field: string; oldValue: unknown; newValue: unknown; reason: string; requestedAt: string } };

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? Object.values(v as object).filter((x) => x !== undefined).join(' / ') : String(v));

export default function ReportsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'urgent' | 'followup' | 'corrections'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overall, setOverall] = useState('');
  const search = useDebounced(q);
  const params = { q: search, page, limit: 25, from, to, overallStatus: tab === 'urgent' ? 'URGENT_ATTENTION' : overall || undefined, followUpRequired: tab === 'followup' ? 'true' : undefined };
  const list = useQuery({ queryKey: ['reports', params], queryFn: () => getPaged<Row>(`/admin/reports${toQuery(params)}`), placeholderData: keepPreviousData, enabled: tab !== 'corrections' });
  const corrections = useQuery({ queryKey: ['reports', 'corrections'], queryFn: () => get<Correction[]>('/admin/corrections') });
  const review = useAction(({ c, approve }: { c: Correction; approve: boolean }) => post(`/admin/health-visits/${c.visitId}/corrections/${c.correction._id}/review`, { approve }), { success: 'Correction reviewed', invalidate: [['reports'], ['booking']] });

  const columns: Column<Row>[] = [
    { key: 'p', header: 'Parent', cell: (r) => <div><p className="font-medium">{r.data.patient.name}</p><p className="text-sm text-ink-muted">{r.data.patient.city}</p></div> },
    { key: 's', header: 'Visit', cell: (r) => <div><p>{r.serviceName}</p><p className="text-sm text-ink-muted">{dateTime(r.visitDate)}</p></div> },
    { key: 'n', header: 'Report', hideBelow: 'md', cell: (r) => <div><p>{r.reportNumber}{r.version > 1 && <span className="text-ink-muted"> v{r.version}</span>}</p><p className="text-sm text-ink-muted">by {r.data.assistant?.name} · PDF {humanize(r.pdf?.status)}</p></div> },
    { key: 'st', header: 'Recorded status', cell: (r) => <div className="space-y-1"><OverallBadge status={r.overallStatus} />{r.followUpRequired && <div><Badge tone="warn">Follow-up</Badge></div>}</div> },
  ];

  return (
    <>
      <PageHeader title="Reports" subtitle="Visit reports shared with families. Corrections create a new version; the old one is kept." />
      <div className="panel">
        <div className="px-5 pt-2">
          <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'all', label: 'All' }, { value: 'urgent', label: 'Urgent' }, { value: 'followup', label: 'Follow-up' }, { value: 'corrections', label: 'Correction requests', count: corrections.data?.length }]} />
        </div>
        {tab === 'corrections' ? (
          corrections.isError ? <div className="p-5"><ErrorState error={corrections.error} /></div> : corrections.data?.length ? (
            <ul>
              {corrections.data.map((c) => (
                <li key={c.correction._id} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.parentName} · <Link className="link" href={`/bookings/${c.bookingId}`}>{c.bookingNumber}</Link></p>
                    <p className="text-[15px]">{humanize(c.correction.field.replace('measurements.', ''))}: <span className="text-ink-muted line-through">{show(c.correction.oldValue)}</span> → <span className="font-semibold">{show(c.correction.newValue)}</span></p>
                    <p className="text-sm text-ink-muted">{c.requestedByName} · {dateTime(c.correction.requestedAt)} · “{c.correction.reason}”</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => review.mutate({ c, approve: false })}>Reject</Button>
                  <Button size="sm" onClick={() => review.mutate({ c, approve: true })}>Apply</Button>
                </li>
              ))}
            </ul>
          ) : <Empty title="No correction requests" />
        ) : (
          <>
            <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-2 lg:grid-cols-[1fr_190px_160px_160px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
                <Input aria-label="Search reports" className="pl-9" placeholder="Report no., booking no. or parent" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
              </div>
              <Select aria-label="Health status" value={overall} disabled={tab === 'urgent'} onChange={(e) => { setOverall(e.target.value); setPage(1); }}><option value="">Any status</option><option value="STABLE">Stable</option><option value="NEEDS_ATTENTION">Needs attention</option><option value="URGENT_ATTENTION">Urgent</option></Select>
              <Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
              <Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
            {list.isError ? <div className="p-5"><ErrorState error={list.error} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(r) => router.push(`/reports/${r._id}`)} empty={<Empty title="No reports" />} />}
            <Pagination meta={list.data?.meta} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}
