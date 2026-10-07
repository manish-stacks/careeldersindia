'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { todayIST } from '@/lib/hooks';
import { dateOnly, timeOnly, toQuery } from '@/lib/utils';
import type { BookingStatus } from '@/lib/types';
import { Empty, ErrorState, Panel, Skeleton } from '@/components/ui/misc';
import { BookingBadge } from '@/components/ui/status';
import { Input } from '@/components/ui/form';

type Day = { date: string; total: number; completed: number; minutes: number; visits: { _id: string; bookingNumber: string; scheduledAt: string; durationMinutes?: number; status: BookingStatus; parentSnapshot: { fullName: string }; addressSnapshot: { city: string; line1?: string }; serviceSnapshot: { name: string } }[] };
type Report = { totalVisits: number; completed: number; days: Day[]; from: string; to: string };

/** Every visit of one assistant for a date range, grouped by day. */
export function AssistantDayReport({ assistantId, initialFrom, initialTo }: { assistantId: string; initialFrom?: string; initialTo?: string }) {
  const [from, setFrom] = useState(initialFrom || todayIST());
  const [to, setTo] = useState(initialTo || initialFrom || todayIST());
  const q = useQuery({ queryKey: ['assistant-day-report', assistantId, from, to], queryFn: () => get<Report>(`/admin/assistants/${assistantId}/day-report${toQuery({ from, to })}`) });
  return (
    <Panel
      title="Day-wise visit report"
      bodyClass="p-0"
      action={<span className="flex items-center gap-2"><Input aria-label="From" type="date" className="h-9 w-40" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /><span className="text-ink-muted">to</span><Input aria-label="To" type="date" className="h-9 w-40" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></span>}
    >
      {q.isLoading ? <Skeleton className="m-5 h-32" /> : q.isError ? <div className="p-5"><ErrorState error={q.error} retry={() => q.refetch()} /></div> : !q.data?.days.length ? <Empty title="No visits in this period" /> : (
        <>
          <p className="border-b border-line px-5 py-3 text-sm text-ink-muted"><b className="text-ink">{q.data.totalVisits}</b> visits · <b className="text-ink">{q.data.completed}</b> completed · {q.data.days.length} working day{q.data.days.length === 1 ? '' : 's'}</p>
          {q.data.days.map((d) => (
            <div key={d.date} className="border-b border-line last:border-0">
              <div className="flex items-center justify-between bg-canvas/60 px-5 py-2 text-sm font-semibold"><span>{dateOnly(d.date)}</span><span className="font-normal text-ink-muted">{d.total} visit{d.total === 1 ? '' : 's'} · {d.completed} done · {Math.round(d.minutes / 60 * 10) / 10} h planned</span></div>
              <ul>
                {d.visits.map((v) => (
                  <li key={v._id}>
                    <Link href={`/bookings/${v._id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas/70">
                      <span><span className="font-medium">{timeOnly(v.scheduledAt)}</span> · {v.parentSnapshot.fullName} <span className="text-ink-muted">· {v.serviceSnapshot.name} · {v.addressSnapshot.city}</span></span>
                      <BookingBadge status={v.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
