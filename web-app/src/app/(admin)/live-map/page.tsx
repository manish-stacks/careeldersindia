'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useSocketEvent, EVENTS } from '@/lib/socket';
import { useNow } from '@/lib/hooks';
import { cn, relative, timeOnly } from '@/lib/utils';
import type { BookingStatus, LiveLocation } from '@/lib/types';
import { Empty, PageHeader, Panel } from '@/components/ui/misc';
import { BookingBadge } from '@/components/ui/status';
import { LiveMap, type MapPoint } from '@/components/map';

type Active = {
  bookingId: string; bookingNumber: string; status: BookingStatus; scheduledAt: string; assistant: { id: string; name: string; mobile?: string } | null;
  patientName: string; serviceName: string; destination?: { lat: number; lng: number }; area: string; location: LiveLocation | null;
};

const STALE_MS = 3 * 60_000;

export default function LiveMapPage() {
  const qc = useQueryClient();
  const now = useNow(15_000);
  const [focus, setFocus] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['live-map'], queryFn: () => get<Active[]>('/admin/live-map'), refetchInterval: 60_000 });

  // Patch positions in place as pings arrive — no refetch per ping
  useSocketEvent<{ location: LiveLocation }>(EVENTS.LOCATION_UPDATED, ({ location }) => {
    qc.setQueryData<Active[]>(['live-map'], (rows) => rows?.map((r) => (String(r.bookingId) === location.bookingId ? { ...r, location } : r)));
  });

  const rows = q.data || [];
  const shown = focus ? rows.filter((r) => String(r.bookingId) === focus) : rows;
  const points = useMemo(() => {
    const pts: MapPoint[] = [];
    shown.forEach((r) => {
      if (r.location) pts.push({ id: `a-${r.bookingId}`, kind: 'assistant', lat: r.location.latitude, lng: r.location.longitude, label: r.assistant?.name || 'Assistant', sub: `${r.patientName} · ${relative(r.location.timestamp)}`, href: `/bookings/${r.bookingId}`, stale: now - new Date(r.location.timestamp).getTime() > STALE_MS });
      if (r.destination?.lat) pts.push({ id: `h-${r.bookingId}`, kind: 'home', lat: r.destination.lat, lng: r.destination.lng, label: r.patientName, sub: r.area, href: `/bookings/${r.bookingId}` });
    });
    return pts;
  }, [shown, now]);
  const lines = shown.filter((r) => r.location && r.destination?.lat).map((r) => [[r.location!.latitude, r.location!.longitude], [r.destination!.lat, r.destination!.lng]] as [number, number][]);
  const moving = rows.filter((r) => r.location).length;

  return (
    <>
      <PageHeader title="Live map" subtitle={`${moving} assistant${moving === 1 ? '' : 's'} sharing location · ${rows.length} active visit${rows.length === 1 ? '' : 's'}. Location is shared only while travelling to a visit.`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel bodyClass="p-3">
          <LiveMap points={points} lines={lines} height={560} />
          <p className="mt-2 px-1 text-xs text-ink-muted">Red dot: assistant. Grey dot: no update in 3+ minutes. House: parent&apos;s address.</p>
        </Panel>
        <Panel title="Active visits" bodyClass="p-0" action={focus && <button className="link text-sm" onClick={() => setFocus(null)}>Show all</button>}>
          {!rows.length && <Empty title="No one on the road" body="Visits appear here once the assistant confirms, and move live after they start travel." />}
          <ul className="max-h-[560px] overflow-y-auto">
            {rows.map((r) => {
              const id = String(r.bookingId);
              const stale = r.location && now - new Date(r.location.timestamp).getTime() > STALE_MS;
              return (
                <li key={id} className={cn('border-b border-line last:border-0', focus === id && 'bg-brand-soft/50')}>
                  <button className="w-full px-5 py-3 text-left hover:bg-canvas/70" onClick={() => setFocus(focus === id ? null : id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.assistant?.name || 'Unassigned'}</span>
                      <BookingBadge status={r.status} />
                    </div>
                    <p className="text-sm text-ink-muted">
                      to {r.patientName} · {r.area} · {timeOnly(r.scheduledAt)}
                    </p>
                    <p className={cn('mt-0.5 text-sm', !r.location ? 'text-ink-faint' : stale ? 'text-warn' : 'text-ok')}>
                      {r.location ? `Location ${relative(r.location.timestamp)}${r.location.speed ? ` · ${Math.round(r.location.speed * 3.6)} km/h` : ''}` : r.status === 'ASSISTANT_ACCEPTED' ? 'Not travelling yet' : 'No location yet'}
                    </p>
                  </button>
                  <div className="px-5 pb-3">
                    <Link href={`/bookings/${id}`} className="link text-sm">
                      {r.bookingNumber}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
