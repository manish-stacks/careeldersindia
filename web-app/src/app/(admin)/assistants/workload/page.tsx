'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { getPaged, http } from '@/lib/api';
import { todayIST, useDebounced } from '@/lib/hooks';
import { toQuery } from '@/lib/utils';
import { addDays } from '@/components/plans/shared';
import { DataTable, type Column } from '@/components/ui/table';
import { Avatar, Empty, ErrorState, PageHeader, Pagination } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/status';

type Row = { _id?: string; assistantId: string; name: string; email: string; mobile?: string; loginStatus: string; assigned: number; completed: number; active: number; waiting: number; noShow: number; rejected: number; minutes: number; workingDays: number; maxPerDay: number; daily: { date: string; count: number; completed: number }[] };
type Meta = { page: number; limit: number; total: number; totalPages: number; summary?: { assistants: number; assigned: number; completed: number; idle: number }; from?: string; to?: string };

export default function WorkloadPage() {
  const router = useRouter();
  const today = todayIST();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('assigned');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const params = { from, to, q: search, sort, page, limit: 25 };
  const list = useQuery({ queryKey: ['assistant-workload', params], queryFn: () => getPaged<Row>(`/admin/assistants/workload${toQuery(params)}`), placeholderData: keepPreviousData });
  const meta = list.data?.meta as Meta | undefined;
  const preset = (days: number) => { setFrom(addDays(today, -days + 1)); setTo(today); setPage(1); };
  const dayLink = (a: Row) => `/assistants/${a.assistantId}?from=${from}&to=${to}`;

  async function exportCsv() {
    const r = await http.get(`/admin/assistants/workload${toQuery({ from, to, q: search, sort, page: 1, limit: 200 })}`);
    const rows = r.data.data as Row[];
    const head = ['Assistant', 'Mobile', 'Assigned', 'Completed', 'In progress', 'Awaiting', 'Rejected', 'No-show', 'Working days', 'Max visits/day', 'Planned hours'];
    const lines = rows.map((a) => [a.name, a.mobile || '', a.assigned, a.completed, a.active, a.waiting, a.rejected, a.noShow, a.workingDays, a.maxPerDay, (a.minutes / 60).toFixed(1)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `assistant-workload-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Assistant', cell: (a) => <div className="flex items-center gap-3"><Avatar name={a.name} /><div className="min-w-0"><p className="font-medium">{a.name}</p><p className="truncate text-sm text-ink-muted">{a.mobile || a.email}</p></div></div> },
    { key: 'assigned', header: 'Assigned', cell: (a) => <span className="text-lg font-semibold">{a.assigned}</span> },
    { key: 'done', header: 'Completed', cell: (a) => a.completed },
    { key: 'live', header: 'In progress / awaiting', hideBelow: 'md', cell: (a) => `${a.active} / ${a.waiting}` },
    { key: 'rej', header: 'Rejected · No-show', hideBelow: 'md', cell: (a) => <span>{a.rejected ? <Badge tone="warn">{a.rejected} rejected</Badge> : '0'} {a.noShow ? <Badge tone="danger">{a.noShow} no-show</Badge> : ''}</span> },
    { key: 'days', header: 'Days · max/day', hideBelow: 'lg', cell: (a) => `${a.workingDays} · ${a.maxPerDay}` },
    { key: 'hrs', header: 'Planned hours', hideBelow: 'lg', cell: (a) => (a.minutes / 60).toFixed(1) },
    { key: 'go', header: '', cell: (a) => <Link href={dayLink(a)} className="link text-sm" onClick={(e) => e.stopPropagation()}>Day report</Link> },
  ];

  return (
    <>
      <PageHeader back={{ href: '/assistants', label: 'Assistants' }} title="Assistant workload" subtitle="How many visits each assistant was given, and how the day went. Open a row for the day-wise visit list."
        actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />Download CSV</Button>} />
      {meta?.summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          {[['Assistants', meta.summary.assistants], ['Visits assigned', meta.summary.assigned], ['Completed', meta.summary.completed], ['Without any visit', meta.summary.idle]].map(([k, v]) => (
            <div key={String(k)} className="panel px-5 py-4"><p className="text-sm text-ink-muted">{k}</p><p className="text-2xl font-bold">{v}</p></div>
          ))}
        </div>
      )}
      <div className="panel">
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_170px_auto]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" /><Input aria-label="Search assistants" className="pl-9" placeholder="Name, email or mobile" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); setPage(1); }} />
          <Input aria-label="To date" type="date" min={from} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          <Select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="assigned">Most assigned</option><option value="completed">Most completed</option><option value="name">Name A–Z</option></Select>
          <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => preset(1)}>Today</Button><Button size="sm" variant="secondary" onClick={() => preset(7)}>7 days</Button><Button size="sm" variant="secondary" onClick={() => preset(30)}>30 days</Button></span>
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} retry={() => list.refetch()} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} rowKey={(a) => a.assistantId} onRowClick={(a) => router.push(dayLink(a))} empty={<Empty title="No approved assistants found" />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
    </>
  );
}
