'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CheckCircle2, Clock, HeartPulse, MapPin, Phone, ShieldAlert, Siren, User } from 'lucide-react';
import { getPaged, post } from '@/lib/api';
import { useAction, useNow } from '@/lib/hooks';
import { cn, dateTime, humanize, relative, toQuery } from '@/lib/utils';
import { Empty, ErrorState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';

type Alert = {
  _id: string; type: 'SOS' | 'HEALTH_URGENT'; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; message?: string; createdAt: string; location?: { lat: number; lng: number };
  raisedBy?: { name: string; role: string; mobile?: string }; parentId?: { _id: string; fullName: string; mobile?: string; address?: { city: string }; emergencyContacts?: { name: string; relation?: string; mobile: string }[] };
  bookingId?: { _id: string; bookingNumber: string; status: string }; acknowledgedBy?: { name: string }; acknowledgedAt?: string; resolvedBy?: { name: string }; resolvedAt?: string; resolutionNotes?: string;
};

const TONE = {
  OPEN: { bar: 'bg-danger', soft: 'bg-danger-soft', text: 'text-danger', label: 'Needs action' },
  ACKNOWLEDGED: { bar: 'bg-warn', soft: 'bg-warn-soft', text: 'text-warn', label: 'Being handled' },
  RESOLVED: { bar: 'bg-ok', soft: 'bg-ok-soft', text: 'text-ok', label: 'Resolved' },
} as const;

const mins = (from: string, now: number) => Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

function Stat({ label, value, tone, icon }: { label: string; value: number | string; tone: keyof typeof TONE; icon: React.ReactNode }) {
  return (
    <div className="panel flex items-center gap-4 px-5 py-4">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', TONE[tone].soft, TONE[tone].text)}>{icon}</span>
      <div><p className="text-2xl font-bold leading-none">{value}</p><p className="mt-1 text-sm text-ink-muted">{label}</p></div>
    </div>
  );
}

export default function AlertsPage() {
  const now = useNow(30_000);
  const [status, setStatus] = useState<'active' | 'RESOLVED'>('active');
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [resolving, setResolving] = useState<Alert | null>(null);
  const list = useQuery({
    queryKey: ['alerts', 'list', page, status, type],
    queryFn: () => getPaged<Alert>(`/admin/emergency-alerts${toQuery({ status: status === 'active' ? 'ACTIVE' : 'RESOLVED', type, page, limit: 15 })}`),
    placeholderData: keepPreviousData, refetchInterval: 15_000,
  });
  const count = (s: string) => useQuery({ queryKey: ['alerts', 'count', s], queryFn: () => getPaged<Alert>(`/admin/emergency-alerts${toQuery({ status: s, limit: 1 })}`), refetchInterval: 15_000 }); // eslint-disable-line react-hooks/rules-of-hooks
  const nOpen = count('OPEN'); const nAck = count('ACKNOWLEDGED'); const nDone = count('RESOLVED');
  const items = list.data?.items || [];
  const ack = useAction((id: string) => post(`/admin/emergency-alerts/${id}/acknowledge`), { success: 'Acknowledged — the person who raised it has been told', invalidate: [['alerts'], ['dashboard']] });

  return (
    <>
      <PageHeader title="Emergency alerts" subtitle="SOS calls and visits marked urgent. Call first; this app never replaces emergency services. The list refreshes every 15 seconds." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Open — nobody has responded" value={nOpen.data?.meta.total ?? '–'} tone="OPEN" icon={<Siren className="h-5 w-5" />} />
        <Stat label="Acknowledged — in progress" value={nAck.data?.meta.total ?? '–'} tone="ACKNOWLEDGED" icon={<ShieldAlert className="h-5 w-5" />} />
        <Stat label="Resolved (all time)" value={nDone.data?.meta.total ?? '–'} tone="RESOLVED" icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: 'active', label: 'Needs action' }, { value: 'RESOLVED', label: 'Resolved' }]} />
        <Select aria-label="Alert type" className="w-48" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All types</option><option value="SOS">SOS</option><option value="HEALTH_URGENT">Urgent health</option></Select>
      </div>
      {list.isError && <ErrorState error={list.error} retry={() => list.refetch()} />}
      {list.isLoading && <Skeleton className="h-48" />}
      {!list.isLoading && !items.length && <div className="panel"><Empty icon={<CheckCircle2 className="h-6 w-6" />} title={status === 'active' ? 'All clear' : 'No resolved alerts yet'} body={status === 'active' ? 'No one needs help right now.' : undefined} /></div>}
      <div className="space-y-4">
        {items.map((a) => {
          const t = TONE[a.status];
          const waiting = mins(a.createdAt, a.resolvedAt ? new Date(a.resolvedAt).getTime() : now);
          const contacts = [...(a.parentId?.mobile ? [{ name: a.parentId.fullName, relation: 'Parent', mobile: a.parentId.mobile }] : []), ...(a.parentId?.emergencyContacts || [])];
          return (
            <article key={a._id} className="panel flex overflow-hidden">
              <span className={cn('w-1.5 shrink-0', t.bar, a.status === 'OPEN' && 'animate-pulse')} />
              <div className="min-w-0 flex-1">
                <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', t.soft, t.text)}>{a.type === 'SOS' ? <Siren className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}</span>
                  <div className="min-w-0">
                    <h2 className="font-semibold leading-tight">{a.type === 'SOS' ? 'SOS' : 'Urgent health reading'} <span className="font-normal text-ink-muted">· {a.type === 'SOS' ? `${a.raisedBy?.name || 'user'} (${humanize(a.raisedBy?.role)})` : a.parentId?.fullName || 'parent'}</span></h2>
                    <p className="text-sm text-ink-muted">{dateTime(a.createdAt)} · {relative(a.createdAt)}</p>
                  </div>
                  <span className={cn('ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', t.soft, t.text)}><Clock className="h-4 w-4" />{a.status === 'RESOLVED' ? `Resolved in ${dur(waiting)}` : `Waiting ${dur(waiting)}`}</span>
                  <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', t.soft, t.text)}>{t.label}</span>
                </header>
                <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
                  <div className="space-y-3">
                    {a.message && <p className="rounded-lg bg-canvas px-4 py-3 text-[15px]">{a.message}</p>}
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {a.parentId && <span className="inline-flex items-center gap-1.5 text-ink-muted"><User className="h-4 w-4" />{a.parentId.fullName}{a.parentId.address?.city ? `, ${a.parentId.address.city}` : ''}</span>}
                      {a.bookingId && <Link href={`/bookings/${a.bookingId._id}`} className="link">Booking {a.bookingId.bookingNumber}</Link>}
                      {a.location && <a className="link inline-flex items-center gap-1" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.location.lat},${a.location.lng}`}><MapPin className="h-4 w-4" />Location when raised</a>}
                    </div>
                    <ol className="space-y-1 border-l-2 border-line pl-4 text-sm text-ink-muted">
                      <li>Raised {dateTime(a.createdAt)}</li>
                      {a.acknowledgedAt && <li>Acknowledged by {a.acknowledgedBy?.name} · {relative(a.acknowledgedAt)}</li>}
                      {a.resolvedAt && <li className="text-ink">Resolved by {a.resolvedBy?.name} · {dateTime(a.resolvedAt)}{a.resolutionNotes ? ` — “${a.resolutionNotes}”` : ''}</li>}
                    </ol>
                  </div>
                  <div>
                    {a.raisedBy?.mobile && <a href={`tel:${a.raisedBy.mobile}`} className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2.5 font-semibold text-white hover:opacity-90"><Phone className="h-4 w-4" />Call {a.raisedBy.name} · {a.raisedBy.mobile}</a>}
                    {!!contacts.length && (
                      <>
                        <p className="mb-1.5 text-sm font-semibold text-ink-soft">Emergency contacts</p>
                        <ul className="flex flex-wrap gap-2">
                          {contacts.map((c) => <li key={c.mobile}><a href={`tel:${c.mobile}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm hover:bg-canvas"><Phone className="h-3.5 w-3.5 text-brand" />{c.name}{c.relation ? ` (${c.relation})` : ''} · {c.mobile}</a></li>)}
                        </ul>
                      </>
                    )}
                    {a.status !== 'RESOLVED' && (
                      <div className="mt-4 flex gap-2">
                        {a.status === 'OPEN' && <Button onClick={() => ack.mutate(a._id)} loading={ack.isPending && ack.variables === a._id}>Acknowledge</Button>}
                        <Button variant="secondary" onClick={() => setResolving(a)}>Resolve</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <Pagination meta={list.data?.meta} onPage={setPage} />
      {resolving && <ResolveDialog alert={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}

function ResolveDialog({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const act = useAction(() => post(`/admin/emergency-alerts/${alert._id}/resolve`, { notes }), { success: 'Alert resolved', invalidate: [['alerts'], ['dashboard']], onDone: onClose });
  return (
    <Dialog open onClose={onClose} title="Resolve alert" description="Record what was done. This is kept in the audit log." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={notes.trim().length < 3}>Resolve</Button></>}>
      <Field label="What happened?">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Spoke with daughter; family doctor adjusted morning tablet." />
      </Field>
    </Dialog>
  );
}
