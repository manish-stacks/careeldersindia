'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getPaged } from '@/lib/api';
import { dateOnly, dateTime, humanize, inr, toQuery } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table';
import { Search } from 'lucide-react';
import { useDebounced } from '@/lib/hooks';
import { Input, Select } from '@/components/ui/form';
import { Empty, ErrorState, PageHeader, Pagination, Tabs } from '@/components/ui/misc';
import { Badge } from '@/components/ui/status';
import { FREQUENCIES, PLAN_TONE, freqLabel, type Plan } from '@/components/plans/shared';

export default function PlansPage() {
  const router = useRouter();
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [frequency, setFrequency] = useState('');
  const search = useDebounced(q);
  const params = { status: status === 'all' ? undefined : status, q: search, frequency, page, limit: 25 };
  const list = useQuery({ queryKey: ['plans', params], queryFn: () => getPaged<Plan>(`/admin/recurring-plans${toQuery(params)}`), placeholderData: keepPreviousData });

  const columns: Column<Plan>[] = [
    { key: 'p', header: 'Plan', cell: (p) => <div><p className="font-medium">{p.parentId?.fullName}</p><p className="text-sm text-ink-muted">{p.planNumber} · by {p.customerId?.name}</p></div> },
    { key: 's', header: 'Service', hideBelow: 'md', cell: (p) => <div><p>{p.serviceId?.name}</p><p className="text-sm text-ink-muted">{freqLabel(p)} at {p.timeOfDay} IST</p><p className="text-sm text-ink-muted">{dateOnly(p.startDate)} → {p.endDate ? dateOnly(p.endDate) : '—'}</p></div> },
    {
      key: 'progress',
      header: 'Visits scheduled',
      cell: (p) => (
        <div className="w-36">
          <div className="h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-line"><div className="h-full bg-brand" style={{ width: `${(p.generatedCount / p.totalVisits) * 100}%` }} /></div>
          <p className="mt-1 text-sm text-ink-muted">{p.generatedCount} of {p.totalVisits}</p>
        </div>
      ),
    },
    { key: 'next', header: 'Next visit', hideBelow: 'lg', cell: (p) => (p.status === 'ACTIVE' ? dateTime(p.nextOccurrenceAt) : '—') },
    { key: 'amt', header: 'Prepaid', hideBelow: 'lg', cell: (p) => <span>{inr(p.totalAmount)}<span className="block text-sm text-ink-muted">{inr(p.pricePerVisit)} / visit</span></span> },
    { key: 'st', header: 'Status', cell: (p) => <Badge tone={PLAN_TONE[p.status]}>{humanize(p.status)}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Recurring plans" subtitle="Prepaid visit series. Bookings are created two weeks ahead and each one is verified and assigned like any other visit." />
      <div className="panel">
        <div className="px-5 pt-2">
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={['ACTIVE', 'PAUSED', 'PENDING_PAYMENT', 'COMPLETED', 'CANCELLED', 'all'].map((s) => ({ value: s, label: s === 'all' ? 'All' : humanize(s) }))} />
        </div>
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-[1fr_220px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" /><Input aria-label="Search plans" className="pl-9" placeholder="Plan number (e.g. RP-0012)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select aria-label="Frequency" value={frequency} onChange={(e) => { setFrequency(e.target.value); setPage(1); }}><option value="">Any frequency</option>{FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select>
        </div>
        {list.isError ? <div className="p-5"><ErrorState error={list.error} /></div> : <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(p) => router.push(`/recurring-plans/${p._id}`)} empty={<Empty title="No plans here" />} />}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
    </>
  );
}
