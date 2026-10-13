'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { get } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton } from '@/components/ui/misc';
import { OverallBadge } from '@/components/ui/status';
import { PdfButton } from '@/components/portal/pdf-button';
import { BookingRow, type CustomerBooking } from '@/components/portal/booking-row';
import { dateOnly } from '@/lib/utils';
import type { OverallStatus } from '@/lib/types';

type Home = {
  greetingName: string;
  parents: { _id: string; fullName: string; age?: number; lastVisitAt?: string; lastOverallStatus?: OverallStatus }[];
  upcoming: CustomerBooking[];
  pendingPayments: CustomerBooking[];
  recentReports: { _id: string; reportNumber: string; visitDate: string; overallStatus: OverallStatus; serviceName?: string; data?: { patient?: { name?: string } } }[];
};

export default function CustomerHome() {
  const q = useQuery({ queryKey: ['customer', 'home'], queryFn: () => get<Home>('/customer/home') });
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${d.greetingName}`} subtitle="Here is how your parents are doing." actions={<Link href="/customer/book" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-dark"><PlusCircle className="h-4 w-4" />Book a visit</Link>} />

      {d.pendingPayments.length > 0 && (
        <Panel title="Waiting for payment" bodyClass="p-0 divide-y divide-line">{d.pendingPayments.map((b) => <BookingRow key={b._id} b={b} />)}</Panel>
      )}

      <Panel title="Upcoming visits" action={<Link href="/customer/bookings" className="text-sm font-semibold text-brand">View all</Link>} bodyClass="p-0 divide-y divide-line">
        {d.upcoming.length ? d.upcoming.map((b) => <BookingRow key={b._id} b={b} />) : <Empty title="No upcoming visits" body="Book a visit to have an assistant check on your parent." />}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="My parents" action={<Link href="/customer/parents" className="text-sm font-semibold text-brand">Manage</Link>} bodyClass="p-0 divide-y divide-line">
          {d.parents.length ? d.parents.map((p) => (
            <div key={p._id} className="flex items-center justify-between px-5 py-3.5">
              <div><p className="font-semibold">{p.fullName}</p><p className="text-sm text-ink-muted">{p.age ? `${p.age} years` : ''}{p.lastVisitAt ? ` · last visit ${dateOnly(p.lastVisitAt)}` : ' · no visits yet'}</p></div>
              {p.lastOverallStatus && <OverallBadge status={p.lastOverallStatus} />}
            </div>
          )) : <Empty title="No parents added" body="Add your parent's details to book a visit." action={<Link href="/customer/parents" className="font-semibold text-brand">Add a parent</Link>} />}
        </Panel>
        <Panel title="Recent reports" action={<Link href="/customer/reports" className="text-sm font-semibold text-brand">View all</Link>} bodyClass="p-0 divide-y divide-line">
          {d.recentReports.length ? d.recentReports.map((r) => (
            <div key={r._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0"><p className="truncate font-semibold">{r.data?.patient?.name} · {r.serviceName}</p><p className="text-sm text-ink-muted">{dateOnly(r.visitDate)} · {r.reportNumber}</p></div>
              <div className="flex items-center gap-2"><OverallBadge status={r.overallStatus} /><PdfButton reportId={r._id} /></div>
            </div>
          )) : <Empty title="No reports yet" body="Reports appear here after each completed visit." />}
        </Panel>
      </div>
    </div>
  );
}
