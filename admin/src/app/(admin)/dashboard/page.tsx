'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, CalendarCheck, ChevronRight, ClipboardCheck, DollarSign, UserX, UserPlus, Siren, Wifi } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { get, getPaged } from '@/lib/api';
import { todayIST } from '@/lib/hooks';
import { cn, dateTime, inr, relative, timeOnly } from '@/lib/utils';
import type { Booking } from '@/lib/types';
import { DayBoard } from '@/components/dashboard/day-board';
import { ErrorState, Panel, Skeleton } from '@/components/ui/misc';
import { BookingBadge } from '@/components/ui/status';

type Dashboard = {
  cards: Record<string, number>;
  trend: { date: string; visits: number; completed: number; cancelled: number }[];
  upcoming: Booking[];
  alerts: { _id: string; type: string; status: string; message?: string; createdAt: string; parentId?: { fullName: string }; raisedBy?: { name: string } }[];
  generatedAt: string;
};

export default function DashboardPage() {
  const { can, user } = useAuth();
  const canBookings = can('bookings.view');
  const today = todayIST();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/admin/dashboard'), refetchInterval: 60_000 });
  const board = useQuery({ queryKey: ['bookings', 'today', today], queryFn: () => getPaged<Booking>(`/admin/bookings?from=${today}&to=${today}&limit=200&sort=oldest`), refetchInterval: 60_000, enabled: canBookings });
  const queue = useQuery({ queryKey: ['bookings', 'queue-preview'], queryFn: () => getPaged<Booking>('/admin/bookings?status=PENDING_ADMIN_VERIFICATION,VERIFIED,ASSISTANT_REJECTED&sort=oldest&limit=8'), enabled: canBookings });

  const c = dash.data?.cards;
  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  const dayLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const visibleToday = (board.data?.items || []).filter((b) => !['CANCELLED_BY_ADMIN', 'CANCELLED_BY_CUSTOMER', 'PENDING_PAYMENT', 'DRAFT'].includes(b.status));

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 rounded-panel border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-ink-muted">{dayLabel}, India time</p>
          <h1 className="text-2xl font-bold">{greeting}, {user?.name?.split(' ')[0]}</h1>
          <p className="mt-0.5 text-ink-muted">
            {c ? (c.urgentAlerts || c.pendingVerification || c.unassigned ? 'Here is what needs you right now.' : 'Nothing is waiting on you. All clear.') : 'Loading today’s picture…'}
          </p>
        </div>
        {canBookings && (
          <div className="flex flex-wrap gap-2">
            <Link href="/bookings?queue=verification" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-dark">Verify visits</Link>
            <Link href="/bookings?queue=unassigned" className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 font-semibold hover:bg-canvas">Assign assistants</Link>
          </div>
        )}
      </div>

      {dash.isError && <ErrorState error={dash.error} retry={() => dash.refetch()} />}

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarCheck} tone="bg-info-soft text-info" label="Visits today" value={c ? String((c.activeVisits || 0) + (c.completedToday || 0)) : '–'} note={c ? `${c.completedToday} completed` : ''} />
        <Stat icon={Activity} tone="bg-warn-soft text-warn" label="In progress now" value={c ? String(c.activeVisits) : '–'} note="Assistants with a patient" />
        <Stat icon={Wifi} tone="bg-ok-soft text-ok" label="Assistants online" value={c ? String(c.assistantsOnline) : '–'} note={c ? `${c.customers} families · ${c.parents} parents` : ''} />
        {can('payments.view') && <Stat icon={DollarSign} tone="bg-brand-soft text-brand-dark" label="Collected today" value={c ? inr(c.revenueToday) : '–'} note={c ? `${inr(c.revenueMonth)} this month` : ''} />}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canBookings && <Attention href="/bookings?queue=verification" icon={ClipboardCheck} n={c?.pendingVerification} label="Visits to verify" loading={dash.isLoading} />}
        {canBookings && <Attention href="/bookings?queue=unassigned" icon={UserX} n={c?.unassigned} label="Need an assistant" loading={dash.isLoading} />}
        {can('assistants.view') && <Attention href="/assistants?verificationStatus=PENDING,DOCUMENT_REVIEW" icon={UserPlus} n={c?.pendingAssistants} label="Assistants to review" loading={dash.isLoading} />}
        {can('alerts.view') && <Attention href="/emergency-alerts" icon={Siren} n={c?.urgentAlerts} label="Open alerts" loading={dash.isLoading} urgent />}
      </div>

      {canBookings && <Panel
        title="Today's visits"
        className="mb-6"
        bodyClass="p-0"
        action={
          <span className="text-sm text-ink-muted">
            {c ? `${c.activeVisits} in progress · ${c.completedToday} done · ${c.cancelledToday} cancelled` : ''}
          </span>
        }
      >
        {board.isLoading ? <Skeleton className="m-5 h-40" /> : <DayBoard bookings={visibleToday} />}
      </Panel>}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        {canBookings && <Panel title="Waiting on the desk" bodyClass="p-0" action={<Link href="/bookings?queue=verification" className="link text-sm">Open queue</Link>}>
          {queue.isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : queue.data?.items.length ? (
            <ul>
              {queue.data.items.map((b) => {
                const soon = new Date(b.scheduledAt).getTime() - Date.now() < 24 * 3600000;
                return (
                  <li key={b._id} className="border-b border-line last:border-0">
                    <Link href={`/bookings/${b._id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas/70">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {b.parentSnapshot.fullName} <span className="font-normal text-ink-muted">in {b.addressSnapshot.city}</span>
                        </p>
                        <p className={cn('text-sm', soon ? 'font-medium text-danger' : 'text-ink-muted')}>
                          {dateTime(b.scheduledAt)} ({relative(b.scheduledAt)})
                        </p>
                      </div>
                      <BookingBadge status={b.status} />
                      <ChevronRight className="h-4 w-4 text-ink-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-ink-muted">Nothing waiting. Every paid visit has an assistant.</p>
          )}
        </Panel>}

        <div className="space-y-6">
          <Panel title="Open alerts" bodyClass="p-0" action={<Link href="/emergency-alerts" className="link text-sm">All alerts</Link>}>
            {dash.data?.alerts.length ? (
              <ul>
                {dash.data.alerts.map((a) => (
                  <li key={a._id} className="flex gap-3 border-b border-line px-5 py-3 last:border-0">
                    <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', a.status === 'OPEN' ? 'text-danger' : 'text-warn')} />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {a.type === 'SOS' ? `SOS from ${a.raisedBy?.name || 'user'}` : `Urgent: ${a.parentId?.fullName || 'patient'}`}
                      </p>
                      <p className="line-clamp-2 text-sm text-ink-muted">{a.message}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {relative(a.createdAt)} · {a.status === 'OPEN' ? 'not yet acknowledged' : 'acknowledged'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-ink-muted">{dash.isLoading ? 'Loading…' : 'No open alerts.'}</p>
            )}
          </Panel>

          {can('payments.view') && <Panel title="Money this month">
            <div className="grid grid-cols-3 gap-4">
              <Figure label="Collected" value={inr(c?.revenueMonth)} />
              <Figure label="Refunded" value={inr(c?.refundsMonth)} />
              <Figure label="Today" value={inr(c?.revenueToday)} />
            </div>
          </Panel>}
        </div>
      </div>

      <Panel title="Last 14 days" className="mt-6" action={<span className="text-sm text-ink-muted">{c ? `${c.customers} families · ${c.parents} parents · ${c.assistantsOnline} assistants online` : ''}</span>}>
        <div className="h-56">
          {dash.data && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dash.data.trend.map((t) => ({ ...t, label: t.date.slice(8) + '/' + t.date.slice(5, 7) }))} barGap={2}>
                <CartesianGrid vertical={false} stroke="#E3E6EA" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8A929C', fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fill: '#8A929C', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#F7F8FA' }} contentStyle={{ borderRadius: 10, border: '1px solid #E3E6EA', fontSize: 13 }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#1E7A4F" radius={[0, 0, 0, 0]} />
                <Bar dataKey="visits" name="All visits" fill="#E3E6EA" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelled" name="Cancelled" fill="#0E5A8A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {dash.data && <p className="mt-2 text-xs text-ink-faint">Updated {timeOnly(dash.data.generatedAt)} IST</p>}
      </Panel>
    </>
  );
}

function Attention({ href, icon: Icon, n, label, loading, urgent }: { href: string; icon: typeof Siren; n?: number; label: string; loading?: boolean; urgent?: boolean }) {
  const hot = !!n;
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-4 rounded-panel border bg-white px-4 py-3.5 transition-colors',
        hot && urgent ? 'border-danger/40 bg-danger-soft/50' : hot ? 'border-line-strong' : 'border-line',
        'hover:border-ink-faint'
      )}
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', hot && urgent ? 'bg-danger text-white' : hot ? 'bg-ink text-white' : 'bg-canvas text-ink-faint')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-bold leading-7">{loading ? '–' : n ?? 0}</span>
        <span className="block text-sm text-ink-muted">{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Stat({ icon: Icon, tone, label, value, note }: { icon: typeof Siren; tone: string; label: string; value: string; note?: string }) {
  return (
    <div className="panel flex items-center gap-4 p-4">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="truncate text-2xl font-bold leading-7">{value}</p>
        {note && <p className="truncate text-xs text-ink-faint">{note}</p>}
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
