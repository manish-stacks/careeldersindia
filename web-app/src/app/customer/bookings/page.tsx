'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaged } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton, Pagination, Tabs } from '@/components/ui/misc';
import { BookingRow, type CustomerBooking } from '@/components/portal/booking-row';

export default function BookingsPage() {
  const [scope, setScope] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['customer', 'bookings', scope, page], queryFn: () => getPaged<CustomerBooking>(`/customer/bookings?scope=${scope}&page=${page}&limit=15`) });
  return (
    <div className="space-y-5">
      <PageHeader title="Visits" subtitle="All visits booked for your parents." />
      <Tabs value={scope} onChange={(v) => { setScope(v); setPage(1); }} items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />
      {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Panel bodyClass="p-0 divide-y divide-line">
          {q.data?.items.length ? q.data.items.map((b) => <BookingRow key={b._id} b={b} />) : <Empty title="No visits found" />}
        </Panel>
      )}
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </div>
  );
}
