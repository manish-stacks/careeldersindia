'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { cn, timeOnly } from '@/lib/utils';
import { useNow } from '@/lib/hooks';
import type { Booking, BookingStatus } from '@/lib/types';
import { bookingLabel } from '@/components/ui/status';

const START = 7; // 07:00 IST — first bookable slot
const END = 21; // board ends 21:00 (last slot 20:00 + duration)
const SPAN = (END - START) * 60;

const BLOCK: Partial<Record<BookingStatus, string>> = {
  PENDING_ADMIN_VERIFICATION: 'bg-warn-soft border-warn/50 text-warn',
  VERIFIED: 'bg-warn-soft border-warn/50 text-warn',
  ASSISTANT_REJECTED: 'bg-danger-soft border-danger/50 text-danger',
  ASSISTANT_ASSIGNED: 'bg-info-soft border-info/40 text-info',
  ASSISTANT_ACCEPTED: 'bg-info-soft border-info/40 text-info',
  ON_THE_WAY: 'bg-brand text-white border-brand',
  REACHED: 'bg-brand text-white border-brand',
  VISIT_STARTED: 'bg-brand text-white border-brand',
  COMPLETED: 'bg-ok-soft border-ok/40 text-ok',
  VISIT_COMPLETED: 'bg-ok-soft border-ok/40 text-ok',
  REPORT_GENERATED: 'bg-ok-soft border-ok/40 text-ok',
  NO_SHOW: 'bg-canvas border-line-strong text-ink-muted line-through',
};

function istMinutes(d: string | number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m - START * 60;
}

/**
 * The day at a glance: one lane per assistant (plus "Needs an assistant"),
 * each visit drawn where it sits in India time. Red = someone is on the road or in a home right now.
 */
export function DayBoard({ bookings }: { bookings: Booking[] }) {
  const now = useNow(60_000);
  const lanes = useMemo(() => {
    const map = new Map<string, { key: string; name: string; items: Booking[] }>();
    map.set('none', { key: 'none', name: 'Needs an assistant', items: [] });
    bookings.forEach((b) => {
      const a = b.assistantId && typeof b.assistantId === 'object' ? b.assistantId : null;
      const key = a ? a._id : 'none';
      if (!map.has(key)) map.set(key, { key, name: a?.name || 'Assigned', items: [] });
      map.get(key)!.items.push(b);
    });
    const arr = [...map.values()];
    const unassigned = arr.shift()!;
    arr.sort((x, y) => x.name.localeCompare(y.name));
    return unassigned.items.length ? [unassigned, ...arr] : arr;
  }, [bookings]);

  const nowPos = istMinutes(now);
  const hours = Array.from({ length: END - START + 1 }, (_, i) => START + i);

  if (!bookings.length) {
    return <p className="px-5 py-10 text-center text-ink-muted">No visits scheduled today.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px] px-5 pb-5 pt-2">
        <div className="relative ml-44 h-6 text-xs text-ink-faint">
          {hours.map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(((h - START) * 60) / SPAN) * 100}%` }}>
              {h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`}
            </span>
          ))}
        </div>
        <div className="relative">
          {nowPos > 0 && nowPos < SPAN && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 ml-44" style={{ left: 0, right: 0 }}>
              <div className="absolute bottom-0 top-0 w-px bg-brand" style={{ left: `${(nowPos / SPAN) * 100}%` }}>
                <span className="absolute -top-1.5 -translate-x-1/2 rounded bg-brand px-1 text-[10px] font-semibold text-white">now</span>
              </div>
            </div>
          )}
          {lanes.map((lane) => (
            <div key={lane.key} className="flex items-stretch border-t border-line first:border-t-0">
              <div className={cn('w-44 shrink-0 py-3 pr-3 text-sm font-medium', lane.key === 'none' ? 'text-warn' : 'text-ink-soft')}>
                <span className="line-clamp-1">{lane.name}</span>
                <span className="text-xs font-normal text-ink-faint">{lane.items.length} visit{lane.items.length === 1 ? '' : 's'}</span>
              </div>
              <div className="relative h-[58px] flex-1">
                {hours.map((h) => (
                  <span key={h} className="absolute bottom-0 top-0 w-px bg-line/70" style={{ left: `${(((h - START) * 60) / SPAN) * 100}%` }} />
                ))}
                {lane.items.map((b) => {
                  const left = Math.max(0, istMinutes(b.scheduledAt));
                  const width = Math.max(28, b.durationMinutes);
                  return (
                    <Link
                      key={b._id}
                      href={`/bookings/${b._id}`}
                      title={`${b.parentSnapshot.fullName} · ${b.serviceSnapshot.name} · ${timeOnly(b.scheduledAt)} · ${bookingLabel(b.status)}`}
                      className={cn('absolute top-2 bottom-2 overflow-hidden rounded-md border px-2 py-1 text-xs leading-4 hover:z-20 hover:shadow-pop focus-visible:z-20', BLOCK[b.status] || 'bg-canvas border-line-strong text-ink-soft')}
                      style={{ left: `${(left / SPAN) * 100}%`, width: `${(width / SPAN) * 100}%` }}
                    >
                      <span className="block truncate font-semibold">{b.parentSnapshot.fullName}</span>
                      <span className="block truncate opacity-80">
                        {timeOnly(b.scheduledAt)} · {b.addressSnapshot.city}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="ml-44 mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
          <Legend cls="bg-warn-soft border-warn/50">Waiting on us</Legend>
          <Legend cls="bg-info-soft border-info/40">Assigned</Legend>
          <Legend cls="bg-brand border-brand">In progress</Legend>
          <Legend cls="bg-ok-soft border-ok/40">Done</Legend>
          <Legend cls="bg-danger-soft border-danger/50">Rejected</Legend>
        </div>
      </div>
    </div>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-5 rounded-sm border', cls)} />
      {children}
    </span>
  );
}
