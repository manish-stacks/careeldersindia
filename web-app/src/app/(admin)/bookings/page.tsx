'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Repeat, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteBookingsDialog } from '@/components/bookings/delete-bookings-dialog';
import { getPaged } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { dateTime, inr, relative, toQuery } from '@/lib/utils';
import type { Booking, BookingStatus } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/table';
import { Empty, ErrorState, PageHeader, Pagination, Tabs } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { BookingBadge, bookingLabel, PaymentBadge } from '@/components/ui/status';

type Queue = 'all' | 'verification' | 'unassigned' | 'awaiting_acceptance' | 'active';
const STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'REACHED', 'VISIT_STARTED', 'COMPLETED', 'NO_SHOW', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN'];

function BookingsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>((params.get('queue') as Queue) || 'all');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('scheduled');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const [sel, setSel] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const filters = { queue: queue === 'all' ? undefined : queue, q: search, status: queue === 'all' ? status : undefined, from, to, sort, page, limit: 25, assistantId: params.get('assistantId'), customerId: params.get('customerId'), parentId: params.get('parentId') };
  const list = useQuery({ queryKey: ['bookings', 'list', filters], queryFn: () => getPaged<Booking>(`/admin/bookings${toQuery(filters)}`), placeholderData: keepPreviousData });
  const counts = {
    verification: useQuery({ queryKey: ['bookings', 'count', 'verification'], queryFn: () => getPaged('/admin/bookings?queue=verification&limit=1') }).data?.meta.total,
    unassigned: useQuery({ queryKey: ['bookings', 'count', 'unassigned'], queryFn: () => getPaged('/admin/bookings?queue=unassigned&limit=1') }).data?.meta.total,
    awaiting: useQuery({ queryKey: ['bookings', 'count', 'awaiting'], queryFn: () => getPaged('/admin/bookings?queue=awaiting_acceptance&limit=1') }).data?.meta.total,
    active: useQuery({ queryKey: ['bookings', 'count', 'active'], queryFn: () => getPaged('/admin/bookings?queue=active&limit=1') }).data?.meta.total,
  };

  const pageIds = (list.data?.items || []).map((b) => b._id);
  const allOn = pageIds.length > 0 && pageIds.every((i) => sel.includes(i));
  const columns: Column<Booking>[] = [
    {
      key: 'sel',
      header: <input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 accent-[#0E5A8A]" checked={allOn} onChange={() => setSel(allOn ? sel.filter((i) => !pageIds.includes(i)) : Array.from(new Set([...sel, ...pageIds])))} />,
      cell: (b) => <span onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${b.bookingNumber}`} className="h-4 w-4 accent-[#0E5A8A]" checked={sel.includes(b._id)} onChange={() => toggle(b._id)} /></span>,
    },
    {
      key: 'when',
      header: 'Visit time (IST)',
      cell: (b) => (
        <div>
          <p className="font-medium">{dateTime(b.scheduledAt)}</p>
          <p className="text-sm text-ink-muted">{relative(b.scheduledAt)}</p>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Parent',
      cell: (b) => (
        <div className="min-w-[160px]">
          <p className="font-medium">{b.parentSnapshot.fullName}</p>
          <p className="text-sm text-ink-muted">
            {b.addressSnapshot.city} {b.addressSnapshot.pincode}
          </p>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      hideBelow: 'md',
      cell: (b) => (
        <div>
          <p>{b.serviceSnapshot.name}</p>
          <p className="flex items-center gap-1 text-sm text-ink-muted">
            {b.bookingNumber}
            {b.recurringPlanId && <Repeat className="h-3.5 w-3.5" aria-label="Recurring plan visit" />}
          </p>
        </div>
      ),
    },
    { key: 'assistant', header: 'Assistant', hideBelow: 'lg', cell: (b) => (b.assistantId && typeof b.assistantId === 'object' ? b.assistantId.name : <span className="text-ink-faint">Not assigned</span>) },
    { key: 'pay', header: 'Payment', hideBelow: 'lg', cell: (b) => <div className="space-y-1"><PaymentBadge status={b.paymentStatus} /><p className="text-sm text-ink-muted">{inr(b.price.amount)}</p></div> },
    { key: 'status', header: 'Status', cell: (b) => <BookingBadge status={b.status} /> },
  ];

  return (
    <>
      <PageHeader title="Bookings" subtitle="Every visit, from payment to report. Times are India time." />
      <div className="panel">
        <div className="px-5 pt-2">
          <Tabs<Queue>
            value={queue}
            onChange={(v) => {
              setQueue(v);
              setPage(1);
              router.replace(v === 'all' ? '/bookings' : `/bookings?queue=${v}`);
            }}
            items={[
              { value: 'all', label: 'All' },
              { value: 'verification', label: 'To verify', count: counts.verification },
              { value: 'unassigned', label: 'Need assistant', count: counts.unassigned },
              { value: 'awaiting_acceptance', label: 'Awaiting acceptance', count: counts.awaiting },
              { value: 'active', label: 'In progress', count: counts.active },
            ]}
          />
        </div>
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
            <Input aria-label="Search bookings" placeholder="Booking no., parent name, city or PIN" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
          </div>
          <Select aria-label="Status" value={status} disabled={queue !== 'all'} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{bookingLabel(s)}</option>
            ))}
          </Select>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="scheduled">Latest visit first</option>
            <option value="oldest">Earliest visit first</option>
            <option value="created">Recently booked</option>
          </Select>
        </div>
        {sel.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas px-5 py-3">
            <span className="text-sm font-semibold">{sel.length} selected</span>
            <Button size="sm" variant="danger" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /> Delete selected</Button>
            <Button size="sm" variant="secondary" onClick={() => setSel([])}>Clear</Button>
          </div>
        )}
        {list.isError ? (
          <div className="p-5"><ErrorState error={list.error} retry={() => list.refetch()} /></div>
        ) : (
          <DataTable columns={columns} rows={list.data?.items} loading={list.isLoading} onRowClick={(b) => router.push(`/bookings/${b._id}`)} empty={<Empty title="No bookings match" body="Try clearing the filters or another queue." />} />
        )}
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </div>
      {confirm && <DeleteBookingsDialog ids={sel} onClose={() => setConfirm(false)} onDone={() => setSel([])} />}
    </>
  );
}

export default function BookingsPage() {
  return (
    <Suspense>
      <BookingsInner />
    </Suspense>
  );
}
