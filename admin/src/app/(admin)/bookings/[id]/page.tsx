'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PdfButton } from '@/components/reports/pdf-button';
import { CalendarClock, CheckCircle2, FileText, MapPin, Phone, UserCog, XCircle, Repeat, Navigation } from 'lucide-react';
import { get, post, patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useBookingRoom, useSocketEvent, EVENTS } from '@/lib/socket';
import { age, cn, dateTime, humanize, inr, relative, timeOnly } from '@/lib/utils';
import type { Booking, LiveLocation, Payment, Visit } from '@/lib/types';
import { ErrorState, KeyVal, PageHeader, Panel, Skeleton } from '@/components/ui/misc';
import { Badge, BookingBadge, bookingLabel, OverallBadge, PaymentBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { AssignDialog } from '@/components/bookings/assign-dialog';
import { VisitRecord } from '@/components/bookings/visit-record';
import { LiveMap, type MapPoint } from '@/components/map';

type Detail = {
  booking: Booking;
  visit: Visit | null;
  reports: { _id: string; reportNumber: string; version: number; overallStatus: string; pdf?: { status: string }; createdAt: string }[];
  payment: Payment | null;
  refunds: NonNullable<Payment['refunds']>;
  auditTrail: { _id: string; action: string; actorRole?: string; actorId?: { name: string } | null; metadata?: Record<string, unknown>; createdAt: string }[];
  liveLocation: LiveLocation | null;
  alerts: { _id: string; type: string; status: string; message?: string; createdAt: string }[];
  plan: { _id: string; planNumber: string; frequency: string; totalVisits: number; generatedCount: number; status: string } | null;
};

const VERIFY_FROM = ['PENDING_ADMIN_VERIFICATION'];
const ASSIGN_FROM = ['VERIFIED', 'ASSISTANT_REJECTED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_ACCEPTED', 'ON_THE_WAY'];
const CANCEL_FROM = ['PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED', 'ON_THE_WAY', 'REACHED'];
const RESCHEDULE_FROM = ['PENDING_ADMIN_VERIFICATION', 'VERIFIED', 'ASSISTANT_ASSIGNED', 'ASSISTANT_REJECTED', 'ASSISTANT_ACCEPTED'];
const TRACKING = ['ON_THE_WAY', 'REACHED'];

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => get<Detail>(`/admin/bookings/${id}`) });
  const [live, setLive] = useState<LiveLocation | null>(null);
  const [dialog, setDialog] = useState<null | 'assign' | 'cancel' | 'reschedule' | 'verify'>(null);

  useBookingRoom(id);
  useSocketEvent<{ location: LiveLocation }>(EVENTS.LOCATION_UPDATED, (p) => p.location?.bookingId === id && setLive(p.location));
  useSocketEvent<{ bookingId: string }>(EVENTS.HEALTH_DATA_UPDATED, (p) => p.bookingId === id && qc.invalidateQueries({ queryKey: ['booking', id] }));

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { booking: b, visit, reports, payment, refunds, auditTrail, alerts, plan } = q.data;
  const location = live || q.data.liveLocation;
  const customer = typeof b.customerId === 'object' ? b.customerId : null;
  const assistant = b.assistantId && typeof b.assistantId === 'object' ? b.assistantId : null;
  const p = b.parentSnapshot;
  const mapsHref = b.locationSnapshot ? `https://www.google.com/maps?q=${b.locationSnapshot.lat},${b.locationSnapshot.lng}` : `https://www.google.com/maps/search/${encodeURIComponent(`${b.addressSnapshot.line1}, ${b.addressSnapshot.city} ${b.addressSnapshot.pincode}`)}`;

  const points: MapPoint[] = [];
  if (b.locationSnapshot) points.push({ id: 'home', kind: 'home', lat: b.locationSnapshot.lat, lng: b.locationSnapshot.lng, label: p.fullName, sub: b.addressSnapshot.line1 });
  if (location) points.push({ id: 'asst', kind: 'assistant', lat: location.latitude, lng: location.longitude, label: assistant?.name || 'Assistant', sub: `Updated ${relative(location.timestamp)}` });

  return (
    <>
      <PageHeader
        back={{ href: '/bookings', label: 'Bookings' }}
        title={`${p.fullName}, ${b.serviceSnapshot.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <BookingBadge status={b.status} />
            <span>{b.bookingNumber}</span>
            <span>
              {dateTime(b.scheduledAt)} IST ({relative(b.scheduledAt)})
            </span>
            {plan && (
              <Link href={`/recurring-plans/${plan._id}`} className="link inline-flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5" /> {plan.planNumber}, visit {(b.occurrenceIndex ?? 0) + 1} of {plan.totalVisits}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            {VERIFY_FROM.includes(b.status) && (
              <Button onClick={() => setDialog('verify')}>
                <CheckCircle2 className="h-4 w-4" /> Verify visit
              </Button>
            )}
            {ASSIGN_FROM.includes(b.status) && (
              <Button variant={b.status === 'VERIFIED' || b.status === 'ASSISTANT_REJECTED' ? 'primary' : 'secondary'} onClick={() => setDialog('assign')}>
                <UserCog className="h-4 w-4" /> {assistant ? 'Reassign' : 'Assign assistant'}
              </Button>
            )}
            {RESCHEDULE_FROM.includes(b.status) && (
              <Button variant="secondary" onClick={() => setDialog('reschedule')}>
                <CalendarClock className="h-4 w-4" /> Reschedule
              </Button>
            )}
            {CANCEL_FROM.includes(b.status) && (
              <Button variant="danger" onClick={() => setDialog('cancel')}>
                <XCircle className="h-4 w-4" /> Cancel
              </Button>
            )}
          </>
        }
      />

      {alerts.some((a) => a.status !== 'RESOLVED') && (
        <Link href="/emergency-alerts" className="mb-6 flex items-center gap-3 rounded-panel border border-danger/30 bg-danger-soft px-5 py-3 text-danger">
          <span className="font-semibold">Open alert on this visit</span>
          <span className="truncate text-[15px] text-ink-soft">{alerts.find((a) => a.status !== 'RESOLVED')?.message}</span>
        </Link>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {TRACKING.includes(b.status) && (
            <Panel title="Live location" action={<span className="text-sm text-ink-muted">{location ? `Updated ${relative(location.timestamp)}` : 'Waiting for the first GPS fix'}</span>} bodyClass="p-3">
              <LiveMap points={points} height={300} />
            </Panel>
          )}

          <Panel title="Visit record" action={b.reportId && visit?.status === 'COMPLETED' ? <PdfButton reportId={b.reportId} /> : undefined}>
            {visit ? <VisitRecord visit={visit} /> : <p className="text-ink-muted">The assistant hasn&apos;t started this visit yet.</p>}
          </Panel>

          {!!reports.length && (
            <Panel title="Reports" bodyClass="p-0">
              <ul>
                {reports.map((r) => (
                  <li key={r._id} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-0">
                    <FileText className="h-5 w-5 text-ink-faint" />
                    <div className="flex-1">
                      <Link href={`/reports/${r._id}`} className="font-medium hover:underline">
                        {r.reportNumber}
                      </Link>
                      <p className="text-sm text-ink-muted">
                        Version {r.version} · {dateTime(r.createdAt)} · PDF {humanize(r.pdf?.status)}
                      </p>
                    </div>
                    <OverallBadge status={r.overallStatus as never} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Status history" bodyClass="py-4">
            <ol className="relative ml-2 border-l border-line">
              {[...(b.statusHistory || [])].reverse().map((h, i) => (
                <li key={i} className="relative pb-4 pl-6 last:pb-0">
                  <span className={cn('absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full', DONE_STATES.includes(h.to) ? 'bg-[#16a34a]' : i === 0 ? 'bg-brand' : 'bg-line-strong')} />
                  <p className={cn('text-[15px]', i === 0 && 'font-semibold', DONE_STATES.includes(h.to) && 'font-semibold text-[#15803d]')}>{bookingLabel(h.to as never)}</p>
                  <p className="text-sm text-ink-muted">
                    {dateTime(h.at)} · {h.actorId?.name || humanize(h.actorRole)}
                    {h.note ? ` · “${h.note}”` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Audit trail" bodyClass="p-0">
            <ul className="max-h-80 overflow-y-auto">
              {auditTrail.map((a) => (
                <li key={a._id} className="flex gap-4 border-b border-line px-5 py-2.5 text-sm last:border-0">
                  <span className="w-36 shrink-0 text-ink-muted">{dateTime(a.createdAt)}</span>
                  <span className="flex-1">
                    <span className="font-medium">{humanize(a.action)}</span> by {a.actorId?.name || humanize(a.actorRole)}
                  </span>
                </li>
              ))}
              {!auditTrail.length && <li className="px-5 py-4 text-sm text-ink-muted">No entries.</li>}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Parent">
            <p className="text-lg font-semibold">
              {p.fullName}
              <span className="ml-2 text-base font-normal text-ink-muted">
                {age(p.dateOfBirth)} yrs · {humanize(p.gender)} · {p.bloodGroup}
              </span>
            </p>
            <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-2 flex gap-2 text-[15px] hover:underline">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>
                {[b.addressSnapshot.line1, b.addressSnapshot.line2, b.addressSnapshot.landmark].filter(Boolean).join(', ')}, {b.addressSnapshot.city}, {b.addressSnapshot.state} {b.addressSnapshot.pincode}
              </span>
            </a>
            {p.mobile && (
              <a href={`tel:${p.mobile}`} className="mt-1 flex items-center gap-2 text-[15px] hover:underline">
                <Phone className="h-4 w-4 text-brand" /> {p.mobile}
              </a>
            )}
            <div className="mt-4 space-y-3 text-[15px]">
              {!!p.medicalConditions?.length && <Line k="Conditions" v={p.medicalConditions.join(', ')} />}
              {!!p.allergies?.length && <Line k="Allergies" v={<span className="font-medium text-danger">{p.allergies.join(', ')}</span>} />}
              {!!p.medicines?.length && (
                <Line
                  k="Medicines"
                  v={p.medicines.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ''} (${Object.entries(m.schedule || {}).filter(([, on]) => on).map(([s]) => s).join(', ') || 'as needed'})`).join('; ')}
                />
              )}
              {p.specialInstructions && <Line k="Instructions" v={p.specialInstructions} />}
              {!!p.emergencyContacts?.length && (
                <Line
                  k="Emergency contacts"
                  v={p.emergencyContacts.map((c) => (
                    <a key={c.mobile} href={`tel:${c.mobile}`} className="block hover:underline">
                      {c.name} ({c.relation || 'contact'}) {c.mobile}
                    </a>
                  ))}
                />
              )}
              {b.customerNotes && <Line k="Family's note" v={<span className="italic">“{b.customerNotes}”</span>} />}
            </div>
          </Panel>

          <Panel title="Booked by">
            {customer ? (
              <KeyVal
                cols={1}
                items={[
                  ['Name', <Link key="n" href={`/customers/${customer._id}`} className="link">{customer.name}</Link>],
                  ['Contact', <span key="c">{customer.email}{customer.mobile ? ` · ${customer.mobile}` : ''}</span>],
                  ['Lives in', `${customer.country || '—'} (${customer.timezone || 'IST'})`],
                ]}
              />
            ) : (
              '—'
            )}
          </Panel>

          <Panel title="Assistant">
            {assistant ? (
              <div className="mb-3">
                <Link href={`/assistants/${assistant._id}`} className="text-lg font-semibold hover:underline">
                  {assistant.name}
                </Link>
                {assistant.mobile && (
                  <a href={`tel:${assistant.mobile}`} className="flex items-center gap-2 text-[15px] hover:underline">
                    <Phone className="h-4 w-4 text-brand" /> {assistant.mobile}
                  </a>
                )}
                {b.assignment?.override && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Assigned with override: {b.assignment.overrideReason}</p>}
                {b.travel?.startedAt && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                    <Navigation className="h-4 w-4" /> Left at {timeOnly(b.travel.startedAt)}
                    {b.travel.reachedAt && `, reached ${timeOnly(b.travel.reachedAt)}`}
                  </p>
                )}
              </div>
            ) : (
              <p className="mb-3 text-ink-muted">Not assigned yet.</p>
            )}
            {!!b.assignment?.history?.length && (
              <ul className="space-y-2 border-t border-line pt-3 text-sm">
                {b.assignment.history.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      {h.assistantId?.name || 'Assistant'} <span className="text-ink-muted">· {dateTime(h.assignedAt)}</span>
                      {h.reason && <span className="block text-ink-muted">“{h.reason}”</span>}
                    </span>
                    <Badge tone={h.outcome === 'ACCEPTED' ? 'ok' : h.outcome === 'REJECTED' ? 'danger' : 'neutral'}>{humanize(h.outcome)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Payment" action={payment && <Link href={`/payments?focus=${payment._id}`} className="link text-sm">Open</Link>}>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{inr(b.price.amount)}</span>
              <PaymentBadge status={b.paymentStatus} />
            </div>
            {!!b.price.discount && <p className="text-sm text-ink-muted">Includes plan discount of {inr(b.price.discount)}</p>}
            {payment && (
              <p className="mt-2 text-sm text-ink-muted">
                {payment.receiptNumber} · {humanize(payment.method)} · {dateTime(payment.capturedAt)}
              </p>
            )}
            {refunds.map((r) => (
              <p key={r._id} className="mt-2 text-sm">
                Refund {inr(r.amount)} · {humanize(r.status)} · {dateTime(r.createdAt)}
              </p>
            ))}
            {b.cancellation?.reason && (
              <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                Cancelled by {humanize(b.cancellation.role)} on {dateTime(b.cancellation.at)}: “{b.cancellation.reason}”
              </p>
            )}
          </Panel>

          <AdminNotes bookingId={b._id} initial={b.adminNotes || ''} />
        </div>
      </div>

      <AssignDialog bookingId={b._id} open={dialog === 'assign'} onClose={() => setDialog(null)} current={assistant?._id} />
      {dialog === 'verify' && <VerifyDialog booking={b} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && <CancelDialog booking={b} onClose={() => setDialog(null)} />}
      {dialog === 'reschedule' && <RescheduleDialog booking={b} onClose={() => setDialog(null)} />}
    </>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{k}</p>
      <div>{v}</div>
    </div>
  );
}

function AdminNotes({ bookingId, initial }: { bookingId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const save = useAction(() => patch(`/admin/bookings/${bookingId}/notes`, { adminNotes: text }), { success: 'Notes saved', invalidate: [['booking', bookingId]] });
  return (
    <Panel title="Internal notes">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Only admins see this." />
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={text === initial}>
          Save notes
        </Button>
      </div>
    </Panel>
  );
}

const invalidate = (id: string) => [['booking', id], ['bookings'], ['dashboard']];

function VerifyDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const act = useAction(() => post(`/admin/bookings/${booking._id}/verify`, { notes: notes || undefined }), { success: 'Visit verified — family notified', invalidate: invalidate(booking._id), onDone: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Verify this visit"
      description="Confirm the address, contact and medical notes look right before assigning an assistant."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Not yet</Button>
          <Button onClick={() => act.mutate(undefined)} loading={act.isPending}>Mark verified</Button>
        </>
      }
    >
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[15px] text-ink-soft">
        <li>Address and PIN code are complete and serviceable</li>
        <li>Parent&apos;s phone or an emergency contact is reachable</li>
        <li>Allergies and special instructions are noted for the assistant</li>
      </ul>
      <Field label="Notes (optional)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called son, gate code 4412" />
      </Field>
    </Dialog>
  );
}

function CancelDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const paid = ['PAID', 'PREPAID_PLAN'].includes(booking.paymentStatus);
  const act = useAction(() => post(`/admin/bookings/${booking._id}/cancel`, { reason }), { success: paid ? 'Cancelled — full refund started' : 'Booking cancelled', invalidate: [...invalidate(booking._id), ['payments']], onDone: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel this visit?"
      description={paid ? `The family gets a full refund of ${inr(booking.price.amount)} automatically.` : 'No payment was captured for this booking.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Keep visit</Button>
          <Button variant="danger" onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={reason.trim().length < 3}>Cancel visit</Button>
        </>
      }
    >
      <Field label="Reason" hint="Shared with the family and the assistant.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  );
}

function RescheduleDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [date, setDate] = useState(booking.scheduledLocal?.date || '');
  const [time, setTime] = useState(booking.scheduledLocal?.time || '10:00');
  const [reason, setReason] = useState('');
  const act = useAction(() => post(`/admin/bookings/${booking._id}/reschedule`, { date, time, reason }), { success: 'Rescheduled — it needs verification and an assistant again', invalidate: invalidate(booking._id), onDone: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Move this visit"
      description="Times are India time (07:00 to 20:00). The current assistant is released."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={!date || !time || reason.trim().length < 3}>Reschedule</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time (IST)"><Input type="time" min="07:00" max="20:00" step={900} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label="Reason" className="mt-4"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}


const DONE_STATES: string[] = ['VISIT_COMPLETED', 'REPORT_GENERATED', 'COMPLETED'];
